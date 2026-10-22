# 照片转 PDF

手机上从相册选照片，排序、旋转、把双页照片对半拆开，然后在本机生成 A4 PDF。
照片不会上传到任何服务器，断网也能用。

## 手机上怎么用

部署好之后，用手机浏览器打开网址：

1. 先填「学号」和「姓名」，生成的 PDF 会自动命名为「学号 姓名.pdf」。
2. 点「从相册选择照片」，一次选多张。
3. 用 ↑ ↓ 调整顺序；拍歪了按旋转按钮（每次顺时针 90°）。
4. 一张照片拍到书的两页时，点「拆成两页」，会沿较长的一边切开。
5. 点「生成 PDF」，然后「分享 / 发送」到微信、QQ，或主动「另存到手机」。

首页会显示使用范围：本网站由周子济设计，仅限数学国际班同学使用；
有问题联系 2602 周子济。

iPhone 可以点浏览器分享按钮 →「添加到主屏幕」，以后像 App 一样打开。
微信/QQ 内置浏览器功能受限，建议点右上角「…」→「在浏览器中打开」。

## 本地运行

```bash
cd photo-pdf
npm test                 # 页面切分 + PDF 拼装测试
python3 -m http.server 8000
```

电脑访问 http://localhost:8000；同一 Wi-Fi 下的手机访问
`http://<电脑局域网 IP>:8000`。

本地 HTTP 地址在手机上只能试用，不能「添加到主屏幕」——PWA 安装要求
HTTPS（localhost 除外）。要长期使用，按下面的方法部署。

## 部署到 GitHub Pages

线上地址：<https://ziji-zhou.github.io/photo-pdf/>

网站发布在 `gh-pages` 分支。每次 push 到 `main` 后，
`.github/workflows/deploy.yml` 会把静态文件同步到 `gh-pages`，Pages 再从该分支发布。

仓库的 Pages 设置应保持为：

- Build and deployment → Source：**Deploy from a branch**
- Branch：**gh-pages** → **/ (root)**

如果 Actions 不可用，也可以在本地手动同步：把 `index.html`、`css/`、`js/`、`icons/`、
`manifest.webmanifest`、`sw.js` 和空的 `.nojekyll` 提交到 `gh-pages` 分支后推送。

## 实现说明

- `js/app.js`：选图、缩略图、排序/旋转/拆分、学号姓名命名、生成与分享。
- `js/geometry.js`：切分几何计算，纯函数，可在 Node 里测试。
- `js/pdf.js`：不依赖任何库，手工拼 PDF 1.4；JPEG 用 `/DCTDecode` 原样嵌入，
  每页按 A4 等比缩放居中，横图可以自动用横向页面。
- `sw.js` + `manifest.webmanifest`：离线缓存和安装到桌面。
- 清晰度预设：压缩 1600px / 标准 2400px / 高清 3200px（长边），JPEG 质量 0.78 / 0.85 / 0.92。

## 已知限制

- 三星等部分安卓机的 HEIC 照片，如果浏览器自己解不了，会提示无法读取；
  可以先用系统相册另存为 JPG。
- iOS 微信内置浏览器不能安装到桌面，分享也受限，请用 Safari 打开。
- iOS 分享面板只列出支持该文件类型的 App。QQ/微信不一定接收系统分享出来的 PDF，
  这时先「另存到手机」存进「文件」App，再从聊天窗口的「+ → 文件」发送。
- 一次处理很多张高清照片会占内存，建议单次不超过 30 张；不够可分批生成。
