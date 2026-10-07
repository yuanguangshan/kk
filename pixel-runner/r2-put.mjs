// 无依赖的 Cloudflare R2 上传器（S3 SigV4 手写签名）。
// rclone 不在 PATH 且没有 brew，因此直接用 Node 内置 crypto + fetch 完成签名上传。
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const cfgPath = join(process.env.HOME || '', '.config/rclone/rclone.conf');
const conf = readFileSync(cfgPath, 'utf8');
const section = conf.split(/^\[/m).find((s) => s.startsWith('r2]'));
if (!section) throw new Error('rclone.conf 里没有 [r2] 段');
const pick = (k) => (section.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')) || [])[1]?.trim();
const ACCESS = pick('access_key_id');
const SECRET = pick('secret_access_key');
const ENDPOINT = pick('endpoint').replace(/\/$/, '');
const HOST = new URL(ENDPOINT).host;
const REGION = 'auto';
const BUCKET = 'yuangs';

const sha256 = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/** 对单个 R2 对象做 SigV4 签名请求（PUT / DELETE）。 */
async function signed(method, key, body = Buffer.alloc(0), contentType = '') {
  const payloadHash = sha256(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { host: HOST, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedNames.join(';');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  let k = hmac(`AWS4${SECRET}`, dateStamp);
  k = hmac(k, REGION); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  const signature = createHmac('sha256', k).update(stringToSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`${ENDPOINT}${canonicalUri}`, {
    method, headers: { ...headers, Authorization: auth },
    body: method === 'PUT' ? body : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${key} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res;
}

/** 递归列出要上传的文件（相对 dir 的路径）。 */
function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

const [cmd, localDir, remotePrefix = ''] = process.argv.slice(2);
if (cmd === 'put') {
  const files = walk(localDir);
  let ok = 0;
  for (const rel of files) {
    const key = (remotePrefix ? remotePrefix.replace(/\/$/, '') + '/' : '') + rel.split('\\').join('/');
    const body = readFileSync(join(localDir, rel));
    await signed('PUT', key, body, TYPES[extname(rel).toLowerCase()] || 'application/octet-stream');
    ok++;
    console.log(`  ↑ ${key} (${(body.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`上传完成: ${ok} 个文件 → r2:yuangs/${remotePrefix}`);
} else if (cmd === 'del') {
  await signed('DELETE', localDir);
  console.log('已删除 ' + remotePrefix);
} else if (cmd === 'list') {
  // 见下方 signedGet
  const res = await fetch(`${ENDPOINT}/${BUCKET}?list-type=2&prefix=${remotePrefix}`, {
    headers: await (async () => {
      const payloadHash = sha256('');
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      const canonicalUri = `/${BUCKET}`;
      const params = `list-type=2&prefix=${encodeURIComponent(remotePrefix)}`;
      const headers = { host: HOST, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
      const signedNames = Object.keys(headers).sort();
      const canonicalHeaders = signedNames.map((h) => `${h}:${headers[h]}\n`).join('');
      const signedHeaders = signedNames.join(';');
      const canonicalRequest = ['GET', canonicalUri, params, canonicalHeaders, signedHeaders, payloadHash].join('\n');
      const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
      let k = hmac(`AWS4${SECRET}`, dateStamp);
      k = hmac(k, REGION); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
      const signature = createHmac('sha256', k).update(stringToSign).digest('hex');
      return { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
    })(),
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`list → HTTP ${res.status} ${xml.slice(0, 200)}`);
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  console.log(`r2:yuangs/${remotePrefix} 共 ${keys.length} 个对象:`);
  keys.slice(0, 30).forEach((k) => console.log('  ' + k));
} else {
  console.log('用法: node r2-put.mjs put <本地目录> <远端前缀> | list <前缀>');
}
