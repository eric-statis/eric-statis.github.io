---
layout: post
title: "单隐藏层 MLP 的权重空间置换对称性"
date: 2026-06-07
categories: [Statistics & ML Theory]
tags: [MLP, symmetry, optimization, deep-learning]
summary: "证明单隐藏层 MLP 至少存在 d! 个损失值完全相同的等价解，即权重空间的置换对称性。"
---

## 单隐藏层 MLP 的 $d!$ 等价解

**命题**：一个隐藏层维度为 $d$、单输出的 MLP，对任意局部最小值，至少存在 $d!$ 个损失函数值完全相同的等价解。

**证明**：

隐藏层的计算为 $h = \sigma(W_1 x + b_1)$，输出为 $\hat{y} = w_2^\top h + b_2$。

对隐藏层神经元的序号做任意排列（permutation），同时对应调整权重矩阵的行/列顺序：

$$W_1' = P W_1,\quad b_1' = P b_1,\quad w_2' = P w_2$$

其中 $P$ 是 $d \times d$ 的置换矩阵。由于 $P^\top P = I$：

$$\hat{y}' = (P w_2)^\top \sigma(P W_1 x + P b_1) + b_2 = w_2^\top P^\top \sigma(P z)$$

如果激活函数 $\sigma$ 是逐元素操作，则 $\sigma(P z) = P \sigma(z)$，于是 $\hat{y}' = w_2^\top P^\top P \sigma(z) = \hat{y}$。

$d$ 个神经元有 $d!$ 种排列方式，每种对应一组不同的参数值但输出完全相同，因此损失值也完全相同。这就是**权重空间的置换对称性**。
