PWA iPhone 修正版

修复内容：
1. iPhone 点击“预测下一期”时增加明确的计算中反馈。
2. 修正 Service Worker 缓存版本，避免旧 JS 长期缓存。
3. 历史 CSV 使用 no-store 加载，避免旧缓存导致按钮/数据状态异常。
4. 页面改为 DOMContentLoaded 后再绑定事件，提高 Safari/iPhone 兼容性。
5. 加入更稳健的数据校验和导出下载处理。

上传到 GitHub Pages 时，请直接用本目录文件覆盖仓库根目录同名文件。
尤其确认 app.js、sw.js、index.html 均已更新并提交到 main。
