#!/bin/bash
# ============================================================
#  海空战 SEA STRIKE —— 一键启动局域网服务器
#  用法：  ./serve.sh [端口，默认 8770]
#  然后用 iPad / 手机浏览器打开下面打印出来的地址即可。
# ============================================================
cd "$(dirname "$0")" || exit 1
PORT="${1:-8770}"

# 取本机局域网 IP
IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en1 2>/dev/null)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en2 2>/dev/null)
[ -z "$IP" ] && IP=$(hostname 2>/dev/null)

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║      海空战 · SEA STRIKE  本地服务器      ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  在 iPad / 手机 Safari 里打开："
echo ""
echo "      http://$IP:$PORT"
echo ""
echo "  本机打开：      http://localhost:$PORT"
echo ""
echo "  提示："
echo "   • iPad 要和电脑连同一个 Wi-Fi"
echo "   • 第一次访问如果弹出「是否允许连接」，点允许"
echo "   • iPad 上建议「分享 → 添加到主屏幕」，可全屏运行"
echo "   • 按 Ctrl+C 停止服务"
echo ""

# 端口占用时自动提示
if command -v lsof >/dev/null 2>&1 && lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  ⚠ 端口 $PORT 已被占用，换一个端口：./serve.sh 8790"
  exit 1
fi

# 自动打开本机浏览器
( sleep 1; command -v open >/dev/null 2>&1 && open "http://localhost:$PORT" ) &

exec python3 -m http.server "$PORT" --bind 0.0.0.0