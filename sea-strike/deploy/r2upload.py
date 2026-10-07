#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
r2upload.py —— 把海空战游戏部署到 Cloudflare R2 存储桶
零依赖（只用 Python 标准库），凭据直接复用 ~/.config/rclone/rclone.conf 里的 [r2] 配置。

用法：
    python3 r2upload.py list                      列出账号下的所有桶
    python3 r2upload.py info   <桶名>              看桶里的文件
    python3 r2upload.py upload <桶名> [目录]       上传目录（默认当前项目目录）
    python3 r2upload.py upload <桶名> <目录> --prefix web/    指定前缀
    python3 r2upload.py check  <桶名>              上传后逐个校验 HTTP 状态
    python3 r2upload.py url    <桶名>              打印公开访问地址

环境要求：Python 3.6+、有网络。
"""
import os, sys, re, time, hmac, hashlib, datetime, mimetypes, urllib.request, urllib.error, configparser

CFG = os.path.expanduser('~/.config/rclone/rclone.conf')
REMOTE = 'r2'

# ---------- 读取凭据 ----------
def load_conf():
    if not os.path.exists(CFG):
        sys.exit('✗ 找不到 %s' % CFG)
    cp = configparser.ConfigParser()
    cp.read(CFG)
    if not cp.has_section(REMOTE):
        sys.exit('✗ 配置里没有 [%s] 段' % REMOTE)
    c = cp[REMOTE]
    return {
        'ak': c.get('access_key_id', '').strip(),
        'sk': c.get('secret_access_key', '').strip(),
        'endpoint': c.get('endpoint', '').strip().rstrip('/'),
        'region': c.get('region', 'auto').strip(),
    }

# ---------- SigV4 签名 ----------
def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def sigv4(method, url, headers, body, cfg, payload_hash='UNSIGNED-PAYLOAD'):
    from urllib.parse import urlparse
    p = urlparse(url)
    host = p.netloc
    now = datetime.datetime.now(datetime.timezone.utc)
    amzdate = now.strftime('%Y%m%dT%H%M%SZ')
    datestamp = now.strftime('%Y%m%d')
    h = dict(headers)
    h['host'] = host
    h['x-amz-date'] = amzdate
    h['x-amz-content-sha256'] = payload_hash
    signed = ';'.join(sorted(k.lower() for k in h))
    canonical_headers = ''.join('%s:%s\n' % (k.lower(), str(h[k]).strip()) for k in sorted(h, key=lambda x: x.lower()))
    canonical_uri = p.path or '/'
    canonical_qs = p.query
    canonical_req = '\n'.join([method, canonical_uri, canonical_qs, canonical_headers, signed, payload_hash])

    scope = '%s/%s/s3/aws4_request' % (datestamp, cfg['region'])
    sts = '\n'.join(['AWS4-HMAC-SHA256', amzdate, scope,
                     hashlib.sha256(canonical_req.encode('utf-8')).hexdigest()])
    k = sign(('AWS4' + cfg['sk']).encode('utf-8'), datestamp)
    k = sign(k, cfg['region']); k = sign(k, 's3'); k = sign(k, 'aws4_request')
    signature = hmac.new(k, sts.encode('utf-8'), hashlib.sha256).hexdigest()
    h['Authorization'] = ('AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s'
                          % (cfg['ak'], scope, signed, signature))
    return {kk: vv for kk, vv in h.items() if kk.lower() != 'host'}, host

def request(method, bucket_key, body=b'', cfg=None, extra=None, payload_hash='UNSIGNED-PAYLOAD'):
    """bucket_key 必须是 '桶名/对象键' 的完整形式（R2 用路径第一段当桶名）"""
    from urllib.parse import quote
    url = cfg['endpoint'] + '/' + quote(bucket_key, safe='/')
    headers = extra or {}
    if body:
        headers['Content-Length'] = str(len(body))
    hh, host = sigv4(method, url, headers, body, cfg, payload_hash)
    hh['Host'] = host
    req = urllib.request.Request(url, data=body if body or method in ('PUT', 'POST') else None, method=method)
    for k, v in hh.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

# ---------- 常用操作 ----------
def list_buckets(cfg):
    st, body = request('GET', '', cfg=cfg)  # 空路径 = 列出桶
    if st != 200:
        print('✗ 列举失败 HTTP %s\n%s' % (st, body[:400].decode('utf-8', 'ignore'))); return []
    names = []
    for chunk in body.decode('utf-8', 'ignore').split('<Name>')[1:]:
        names.append(chunk.split('</Name>')[0])
    return names

def list_objects(cfg, bucket, prefix='', maxkeys=40):
    """列出桶内对象（需要正确排序的 query string 参与签名）"""
    from urllib.parse import quote
    qs = 'list-type=2&max-keys=%d' % maxkeys
    if prefix: qs += '&prefix=' + quote(prefix, safe='')
    # 签名时 query 也要用排序后的形式
    url = cfg['endpoint'] + '/' + bucket + '?' + qs
    parts = qs.split('&')
    parts.sort()
    ordered = '&'.join(parts)
    url_signed = cfg['endpoint'] + '/' + bucket + '?' + ordered
    hh, host = sigv4('GET', url_signed, {}, b'', cfg)
    hh['Host'] = host
    req = urllib.request.Request(url, method='GET')
    for k, v in hh.items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        print('✗ HTTP %s %s' % (e.code, e.read()[:200].decode('utf-8', 'ignore')))
        return []
    out = []
    for chunk in body.split('<Key>')[1:]:
        out.append(chunk.split('</Key>')[0])
    return out

def put(cfg, bucket, key, data, ctype, cache='public, max-age=300'):
    extra = {'Content-Type': ctype,
             'Cache-Control': cache}
    st, body = request('PUT', '%s/%s' % (bucket, key), body=data, cfg=cfg, extra=extra)
    return st, body

# ---------- 主流程 ----------
def do_upload(cfg, bucket, root, prefix='', include_screens=False):
    root = os.path.abspath(root)
    skip_dirs = ['.git', 'node_modules'] if include_screens else ['screenshots', '.git', 'node_modules']
    files = []
    if os.path.isfile(root):                       # 也支持直接传单个文件
        files.append((root, os.path.basename(root)))
    else:
        for dp, dn, fn in os.walk(root):
            for f in fn:
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, root)
                if os.path.basename(rel).startswith('.'):  continue
                if rel.split(os.sep)[0] in skip_dirs: continue
                files.append((full, rel))
    files.sort()
    print('待上传 %d 个文件（跳过 screenshots/ 与隐藏文件）：' % len(files))
    ok = 0
    failed = 0
    for full, rel in files:
        key = (prefix + rel).replace(os.sep, '/')
        ext = os.path.splitext(full)[1].lower()
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if ext == '.js':   ctype = 'text/javascript; charset=utf-8'
        if ext == '.html': ctype = 'text/html; charset=utf-8'
        if ext == '.css':  ctype = 'text/css; charset=utf-8'
        # index.html 永远回源校验；js 缓存 5 分钟，改完刷新即生效
        # html 与图片一律回源校验（点开/刷新永远是最新版，未变更时走 304 很便宜）；
        # 只有 js/css 允许短缓存
        if ext in ('.html', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'):
            cache = 'no-cache, must-revalidate'
        else:
            cache = 'public, max-age=300, must-revalidate'
        data = open(full, 'rb').read()
        if ext == '.html':
            # 把 ?v=__V__ 替换成构建时间戳：每次部署 URL 都变，彻底绕开 CDN 缓存
            ver = str(int(time.time()))
            # 只替换 src/href 属性里的版本戳，绝不碰注释/正则里的 ?v=
            vb = ver.encode()
            data = re.sub(rb'((?:src|href)\s*=\s*["\'][^"\']*?\?v=)[^"\']+', lambda g: g.group(1) + vb, data)
        st, body = put(cfg, bucket, key, data, ctype, cache)
        size = len(data)
        if st == 200:
            ok += 1
            print('  ✓ %-34s %7.1f KB  %s' % (key, size / 1024.0, ctype))
        else:
            failed += 1
            print('  ✗ %-34s HTTP %s  %s' % (key, st, body[:200].decode('utf-8', 'ignore')))
    print('\n完成：%d/%d 成功' % (ok, len(files)))
    return failed == 0

def check(cfg, bucket, keys):
    allok = True
    for k in keys:
        st, body = request('GET', '%s/%s' % (bucket, k), cfg=cfg)
        mark = '✓' if st == 200 else '✗'
        if st != 200: allok = False
        print('  %s GET %-30s HTTP %s' % (mark, k, st))
    return allok

def delete(cfg, bucket, key):
    st, body = request('DELETE', '%s/%s' % (bucket, key), cfg=cfg)
    return st, body

def rm_prefix(cfg, bucket, prefix, dry=False):
    objs = list_objects(cfg, bucket, prefix, maxkeys=1000)
    print('前缀 %s/%s 下 %d 个对象%s' % (bucket, prefix, len(objs), '（试运行）' if dry else '，删除中…'))
    ok = 0
    for o in objs:
        if dry:
            print('  · 将删除 %s' % o); continue
        st, body = delete(cfg, bucket, o)
        if st in (200, 204):
            ok += 1
            print('  ✓ 已删除 %s' % o)
        else:
            print('  ✗ %s HTTP %s %s' % (o, st, body[:160].decode('utf-8', 'ignore')))
    if not dry: print('完成：%d/%d 已删除' % (ok, len(objs)))
    return ok, len(objs)

def public_url(bucket):
    acc = load_conf()['endpoint'].split('.')[0].split('//')[-1]
    return 'https://pub-%s.r2.dev/' % acc

if __name__ == '__main__':
    cfg = load_conf()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'list':
        bs = list_buckets(cfg)
        print('账号 %s 下的存储桶：' % cfg['endpoint'].split('.')[0])
        for b in bs:
            print('  • %s' % b)
        if not bs: print('  (一个都没有)')
    elif cmd == 'ls':
        bucket = sys.argv[2]
        prefix = sys.argv[3] if len(sys.argv) > 3 else ''
        objs = list_objects(cfg, bucket, prefix)
        print('桶 %s 里 %d 个对象：' % (bucket, len(objs)))
        for o in objs: print('  %s' % o)
    elif cmd == 'upload':
        bucket = sys.argv[2]
        root = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else '.'
        prefix = ''
        if '--prefix' in sys.argv:
            prefix = sys.argv[sys.argv.index('--prefix') + 1].strip('/') + '/'
        do_upload(cfg, bucket, root, prefix, '--all' in sys.argv)
    elif cmd == 'check':
        bucket = sys.argv[2]
        keys = sys.argv[3:] or ['index.html', 'js/game.js', 'js/touch.js', 'js/models.js', 'js/math.js']
        check(cfg, bucket, keys)
    elif cmd == 'rm':
        bucket = sys.argv[2]
        prefix = sys.argv[3]
        rm_prefix(cfg, bucket, prefix, '--dry' in sys.argv)
    elif cmd == 'url':
        print(public_url(sys.argv[2]))
    else:
        print(__doc__)
