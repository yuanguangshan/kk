# PIXEL RUNNER 部署记录

> **入口：https://pic.want.biz/wyk20.html**（2026-10-07 更新：第24关=94只紫蘑菇从天而降偷袭，非飞鸟）

> **最新入口：https://pic.want.biz/wyk19.html**（2026-10-07）

## 线上地址

| 用途 | URL |
|---|---|
| **游戏主入口** | https://pic.want.biz/pixel-runner.html |
| 备用入口 | https://pic.want.biz/pixel-runner/index.html |
| 截图 | https://pic.want.biz/pixel-runner/screenshot.png |

- 存储桶：Cloudflare R2 `r2:yuangs`（远端配置见 `~/.config/rclone/rclone.conf` 的 `[r2]` 段）
- 公开域名：`pic.want.biz` 直接映射该桶的 key
- 部署前缀：`pixel-runner/`，另在桶根放了 `pixel-runner.html` 作为短链入口

## 怎么更新部署

`rclone` 不在 PATH 且无 brew，因此本目录的 `r2-put.mjs` 用 Node 内置 crypto 手写 S3 SigV4 签名上传，无第三方依赖：

```sh
# 上传整个目录（相对路径会拼到前缀后面）
node r2-put.mjs put <本地目录> <远端前缀>

# 删除单个对象
node r2-put.mjs del <key>

# 列举对象
node r2-put.mjs list <前缀>
```

本次部署用的命令：

```sh
mkdir -p /tmp/site/pixel-runner
cp index.html screenshot*.png /tmp/site/pixel-runner/
node r2-put.mjs put /tmp/site/pixel-runner pixel-runner
cp index.html /tmp/site2/pixel-runner.html && node r2-put.mjs put /tmp/site2 ""
```

## 验证结果

```
https://pic.want.biz/pixel-runner.html              200  98973B  text/html
https://pic.want.biz/pixel-runner/index.html        200  98973B  text/html
https://pic.want.biz/pixel-runner/screenshot.png    200  51075B  image/png
浏览器实测：player 移动 89px，23 关，localStorage 可用，0 报错
```

## 已知问题（部署时点的代码状态）

关卡生成器目前有 **4~10 关不可通关**（疾跑 4 关 / 手机速 10 关），根因是「虚空踩板段」后面紧跟宽坑，从板上跳下来没有助跑距离。相关地形（8 格旋转跳深坑、下坡断层、横扫尖刺）已暂时关闭；旋转跳、天空偷袭怪、虚空三连板这些机制本身是好的，但关卡布局还需要修。

用户可见影响：第 13、14、15、20 关（疾跑）以及第 4、7、10、11、13、14、15、20、21、23 关（手机速）会卡住。
