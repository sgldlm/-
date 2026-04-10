# Polymarket GitHub + 手机安装版

这个整合包分成两部分：

## 1. `pwa/`
这是上传到 GitHub Pages 的前端。
部署后，可以用 Chrome 打开，并安装到手机桌面。

## 2. `backend/`
这是机器人后端。
负责：
- 监听公开交易员 activity / trades
- 风控
- 队列
- 真实下单执行器（当 DRY_RUN=false）

## 最简单使用方法

### A. 上传到 GitHub
把整个文件夹上传到 GitHub 仓库。

### B. 开启 GitHub Pages
仓库里已经带了：
`.github/workflows/pages.yml`

推送到 `main` 后会自动发布 `pwa/`。

### C. 启动后端
```bash
cp .env.example .env
docker compose up --build
```

### D. 手机安装
1. 用 Chrome 打开你的 GitHub Pages 地址
2. 输入你的后端地址，例如：
   `http://你的电脑IP:8787`
   或
   `https://你的后端域名`
3. 点击“连接”
4. 点击“安装到手机”

## 说明
- 前端 UI 已经中文化。
- 交易员名称保留原用户名，并加中文分类。
- 当前版本重点保证：GitHub Pages 可部署、手机可安装、与后端接口联通、配置可编辑、状态可查看、待执行订单可执行。

首次运行建议保持：
`DRY_RUN=true`
