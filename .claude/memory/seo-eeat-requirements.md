---
name: google-seo-eeat-requirements
description: Google SEO E-E-A-T + 高级技术SEO + GEO 要求
metadata:
  type: reference
---

## 核心来源
- Google SEO 入门指南 + "创建实用、可靠、以人为本的内容" 
- Google Search Central 高级指南 (support.google.com/webmasters/answer/9128669)
- 2026 技术SEO + GEO (生成式引擎优化) 趋势

## 内容质量核心要求 (E-E-A-T 2.0)
- **Experience (经验):** 第一手使用经验, "In our testing..."
- **Expertise (专业):** 具体、可验证的信息（工具名、版本号、价格、功能对比）
- **Authoritativeness (权威):** 作者署名 + 关于页 + sameAs 链接
- **Trustworthiness (信任):** 引用来源 + 最后更新 + 无夸大

## Google 明确禁止
- 批量AI生成无人工编辑的内容
- 空泛表述, AI 腔调, 字数填充
- 抄袭/伪原创
- 虚假结构化数据 (会触发 Manual Action)
- 关键词堆砌 (>3%)

## 结构化数据 (2026必备)
- Article — 每篇文章 (含作者、日期、分类)
- FAQPage — 问答页面 (已实现但AI返回不稳定)
- HowTo — 教程/指南页面 (未实现)
- Organization + Person — 品牌实体 (sameAs 链接)
- BreadcrumbList — 面包屑导航 (已实现)
- Product + AggregateRating — 评测文章星级评分 (未实现)

## 技术SEO
- Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1
- 移动优先索引 (响应式设计)
- 正确 robots.txt + sitemap.xml
- canonical 标签处理重复内容
- HTTPS 必须

## GEO (生成式引擎优化) — 2026新趋势
- 83% 的 AI Overview 搜索以零点击结束
- 47% 的 AI 摘要引用来自不在前5名的页面
- 带完整 JSON-LD 标记的页面被 AI 引用概率高 3 倍
- 96% 的 AI Overview 引用来自强 E-E-A-T 信号来源
- 品牌搜索量 > 反向链接, 成为AI引用最强预测因子

## 内容策略 (2026)
- 主题权威 (Topical Authority): 枢纽-星系内容集群结构
- 答案优先: 文章开头150字直接回答核心问题
- 多模态: 文本 + 图片 + 视频 + Schema 结合, AI引用概率高156%
- 内容新鲜度: 定期更新, 标注最后更新时间 (已实现)
- 避免纯AI生成内容: 需要人工编辑环节

## 已实现的改进 (2026-05-15)
- FAQPage Schema: 补充生成机制已修复 — 主响应 FAQ 为空时自动调用二次 API 生成
- HowTo Schema: 已实现 — Tutorial/Guide 文章自动生成 HowTo 步骤
- Product + AggregateRating Schema: 已实现 — Review/Comparison 文章自动生成
- 文章配图: 每 3 节插入一张 placehold.co 占位图 (含 alt text, lazy loading)
- GEO 优化: 写作提示要求 Answer-first 结构 + 清晰陈述
- 主题集群: assignCluster 函数分配 8 个集群 (writing/coding/image/video/productivity/audio/marketing/general)
- 主题集群数据: 每篇文章包含 cluster 字段

## 仍然存在的差距
- Search Console: meta 标记已加但未验证提交
- 主题集群: 缺乏 pillar 页面组织
- 图片: 使用外部占位图 (placehold.co), 建议替换为自有图片
