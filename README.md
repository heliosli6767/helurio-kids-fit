# STARTLUX Kids Fit Studio

一个浏览器端儿童虚拟试衣原型：

- 浏览器语音识别把中文指令转成文本。
- 本地 STARTLUX 兼容 `/v1/systemone` 的 Choice 接口，从 5 件上衣和 5 条裤装中选择标签。
- Lucy Virtual Try-On 3.5 接收摄像头流、服装参考图和组合提示词，返回实时试衣视频。
- 不使用 Jev；手动点击只用于测试衣橱，所有自然语言判断都发送给 STARTLUX。

本地预览：

```bash
python3 -m http.server 4173 --directory dist
```

打开页面右上角设置，填写 STARTLUX 地址与 Lucy API Key。STARTLUX 服务需要允许页面来源的 CORS 请求。
