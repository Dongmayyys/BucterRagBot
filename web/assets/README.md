# 设计资源目录

此目录用于存放原始设计文件，不会被 Git 跟踪。

## 目录结构

```
assets/
├── raw/           ← 未压缩的原始图片
├── *.psd          ← Photoshop 源文件
├── *.sketch       ← Sketch 源文件
└── README.md      ← 本文件
```

## 注意事项

- 此目录已加入 `.gitignore`
- 大文件请存放在云盘（Google Drive / OneDrive）
- 压缩后的图片请放到 `web/public/`
