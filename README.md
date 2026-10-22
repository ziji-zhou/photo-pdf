# 照片转 PDF

手机上从相册选照片，排序、旋转、把双页照片对半拆开，然后在本机生成 A4 PDF。
照片不会上传到任何服务器，断网也能用。

## 手机上怎么用

部署好之后，用手机浏览器打开网址：

1. 点「从相册选择照片」，一次选多张。
2. 用 ↑ ↓ 调整顺序；拍歪了按旋转按钮（每次顺时针 90°）。
3. 一张照片拍到书的两页时，点「拆成两页」，会沿较长的一边切开。
4. 点「生成 PDF」，然后「保存 / 下载」，或者「分享」到微信、QQ、文件。

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

仓库里的 `.github/workflows/deploy.yml` 会在每次 push 到 `main` 时自动发布。

1. 在 GitHub 新建一个 **public** 仓库，例如 `photo-pdf`（不要勾选初始化 README）。
2. 把这个目录推上去（SSH 方式）：

   ```bash
   cd ~/Desktop/photo-pdf
   git remote add origin git@github.com:<你的用户名>/photo-pdf.git
   git push -u origin main
   ```

3. 打开仓库的 Actions 页面，等 “Deploy to GitHub Pages” 跑完。
   工作流会尝试自动开启 Pages；如果提示没有权限，就到
   Settings → Pages → Build and deployment → Source 选 **GitHub Actions**，再重跑一次。
4. 网址是 `https://<你的用户名>.github.io/photo-pdf/`。

## 实现说明

- `js/app.js`：选图、缩略图、排序/旋转/拆分、生成与分享。
- `js/geometry.js`：切分几何计算，纯函数，可在 Node 里测试。
- `js/pdf.js`：不依赖任何库，手工拼 PDF 1.4；JPEG 用 `/DCTDecode` 原样嵌入，
  每页按 A4 等比缩放居中，横图可以自动用横向页面。
- `sw.js` + `manifest.webmanifest`：离线缓存和安装到桌面。
- 清晰度预设：压缩 1600px / 标准 2400px / 高清 3200px（长边），JPEG 质量 0.78 / 0.85 / 0.92。

## 已知限制

- 三星等部分安卓机的 HEIC 照片，如果浏览器自己解不了，会提示无法读取；
  可以先用系统相册另存为 JPG。
- iOS 微信内置浏览器不能安装到桌面，分享也受限，请用 Safari 打开。
- 一次处理很多张高清照片会占内存，建议单次不超过 30 张；不够可分批生成。
