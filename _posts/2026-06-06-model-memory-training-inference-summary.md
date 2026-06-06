---
layout: post
title: "模型训练与推理显存计算总结"
date: 2026-06-06
categories: [Research Notes]
tags: [Deep Learning, LLM, GPU Memory, Training, Inference]
summary: "一份关于模型权重、梯度、Adam 状态、activation、KV cache、LoRA/QLoRA 显存估算的研究笔记。"
---

> **校订说明**：本文中的显存数字用于快速估算。实际占用会受到框架实现、并行策略、optimizer dtype、activation checkpointing、FlashAttention、quantization metadata、CUDA workspace 等因素影响。文中 `GB` 主要按十进制近似口径使用；按二进制口径可理解为 `GiB`，数值会略有差异。

## 0. 总体思路

模型显存可以粗略理解为：

\[
\text{显存} \approx \text{模型权重} + \text{梯度} + \text{优化器状态} + \text{激活值} + \text{临时 buffer}
\]

但是训练和推理需要保存的内容不同。

- **训练**需要保存：
  - 模型权重 weights
  - 梯度 gradients
  - 优化器状态 optimizer states
  - forward 过程中的激活值 activations
  - 临时 buffer

- **推理**通常需要保存：
  - 模型权重 weights
  - KV cache
  - 少量 activation buffer
  - runtime buffer

所以训练显存通常远大于推理显存。

---

## 1. 模型权重显存

假设模型有 \(N\) 个参数，每个参数占 \(b\) bytes，那么权重显存大约是：

\[
\boxed{
\text{Weight Memory} = N \times b
}
\]

例如一个 7B 模型：

\[
N = 7 \times 10^9
\]

如果使用 FP16 / BF16，每个参数占：

\[
2 \text{ bytes}
\]

所以：

\[
7 \times 10^9 \times 2
=
14 \times 10^9 \text{ bytes}
\approx 14 \text{ GB}
\]

因此：

\[
\boxed{
7B \text{ 模型用 FP16/BF16 权重约需要 } 14GB
}
\]

如果按二进制口径换算，\(14 \times 10^9\) bytes 约为 \(13.0\) GiB。因此看到不同工具显示 13GB 左右或 14GB 左右，通常只是单位口径不同。

常见精度对应关系：

| 精度 | 每个参数占用 | 7B 权重大小 |
|---|---:|---:|
| FP32 | 4 bytes | 28GB |
| FP16 / BF16 | 2 bytes | 14GB |
| FP8 | 1 byte | 7GB |
| INT4 | 0.5 byte | 3.5GB |

注意：INT4 真实占用通常会略大于理论值，因为还需要保存 scale、zero-point、metadata 等信息。

---

## 2. 训练显存怎么计算？

训练时显存大致由下面几部分组成：

\[
\boxed{
\text{Training Memory}
=
\text{Weights}
+
\text{Gradients}
+
\text{Optimizer States}
+
\text{Activations}
+
\text{Buffers}
}
\]

---

## 2.1 权重 weights

模型参数本身要放在 GPU 上。

如果使用 FP16 / BF16：

\[
\text{weights} = N \times 2
\]

对于 7B 模型：

\[
7B \times 2 = 14GB
\]

---

## 2.2 梯度 gradients

训练时需要反向传播，所以每个参数通常都需要一个对应的梯度。

如果参数是：

\[
W
\]

那么梯度是：

\[
\frac{\partial L}{\partial W}
\]

梯度数量和参数数量一样。

如果梯度使用 FP16 / BF16 保存：

\[
\text{gradients} = N \times 2
\]

对于 7B 模型：

\[
7B \times 2 = 14GB
\]

所以仅仅权重和梯度就需要：

\[
14GB + 14GB = 28GB
\]

---

## 2.3 优化器状态 optimizer states

训练大模型时常用 Adam / AdamW。

Adam 会为每个参数维护两个状态：

\[
m_t
\]

和

\[
v_t
\]

分别表示一阶动量和二阶动量：

\[
m_t = \beta_1 m_{t-1} + (1-\beta_1)g_t
\]

\[
v_t = \beta_2 v_{t-1} + (1-\beta_2)g_t^2
\]

如果 \(m_t\) 和 \(v_t\) 使用 FP32 保存，每个状态占 4 bytes。

因此 Adam states 占用：

\[
\text{Adam states} = N \times 4 + N \times 4 = 8N \text{ bytes}
\]

对于 7B 模型：

\[
7B \times 8 = 56GB
\]

所以 Adam 优化器状态非常占显存。

---

## 2.4 FP32 master weights

在混合精度训练中，很多 FP16 训练配置会额外保存一份 FP32 master weights；BF16 训练或某些现代 optimizer / framework 配置下不一定需要单独保存这一份，所以这里按较保守的传统混合精度估算。

也就是说：

- FP16 / BF16 权重通常用于 forward 和 backward；
- FP32 master weights 用于稳定地更新参数。

FP32 master weights 占用：

\[
\text{master weights} = N \times 4
\]

对于 7B 模型：

\[
7B \times 4 = 28GB
\]

---

## 2.5 Adam 混合精度训练的参数相关显存

假设使用 Adam / AdamW，并采用需要 FP32 master weights 的传统混合精度训练：

| 项目 | 每个参数占用 |
|---|---:|
| FP16 / BF16 weights | 2 bytes |
| FP16 / BF16 gradients | 2 bytes |
| FP32 master weights | 4 bytes |
| Adam 一阶动量 \(m\) | 4 bytes |
| Adam 二阶动量 \(v\) | 4 bytes |

总共：

\[
2 + 2 + 4 + 4 + 4 = 16 \text{ bytes/parameter}
\]

所以参数相关训练显存大约是：

\[
\boxed{
16N \text{ bytes}
}
\]

对于 7B 模型：

\[
7B \times 16 = 112GB
\]

也就是说：

\[
\boxed{
7B \text{ 模型全参数 Adam 混合精度训练，仅参数相关部分就可能需要约 } 112GB
}
\]

这还没有计算 activation。若使用 BF16 且不保存额外 FP32 master weights，或使用 8-bit optimizer、ZeRO/FSDP 等策略，参数相关显存会显著变化。

---

## 3. 训练中的 activation memory

训练时，forward 过程产生的中间结果需要保存下来，因为 backward 时要用。

例如：

\[
h_1 = f(xW_1)
\]

\[
h_2 = f(h_1W_2)
\]

反向传播时需要用到 \(h_1, h_2, \dots\)，所以这些激活值需要暂时保存在显存中。

activation memory 大致和下面因素成正比：

\[
\boxed{
\text{activation memory}
\propto
B \times T \times H \times L
}
\]

其中：

| 符号 | 含义 |
|---|---|
| \(B\) | batch size |
| \(T\) | sequence length |
| \(H\) | hidden size |
| \(L\) | Transformer 层数 |

所以：

- batch size 越大，显存越大；
- sequence length 越长，显存越大；
- hidden size 越大，显存越大；
- 层数越多，显存越大。

---

## 4. Transformer 训练为什么 activation 很大？

Transformer 不只是保存 hidden states，还可能保存 attention 相关中间值。

例如每层有：

\[
Q = XW_Q
\]

\[
K = XW_K
\]

\[
V = XW_V
\]

还有 attention scores：

\[
A = \frac{QK^\top}{\sqrt{d_k}}
\]

如果 naive attention 保存完整 attention matrix，则每层 attention matrix 的大小大约是：

\[
B \times n_{\text{heads}} \times T \times T
\]

这里最关键的是：

\[
\boxed{T^2}
\]

所以序列长度变长时，训练显存会增长很快。

例如从 2048 tokens 增加到 4096 tokens：

\[
\left(\frac{4096}{2048}\right)^2 = 4
\]

attention matrix 相关显存可能变成 4 倍。

---

## 5. 训练显存粗略公式

对于 Adam 混合精度全参数训练：

\[
\boxed{
\text{Training Memory}
\approx
16N
+
\text{Activation Memory}
+
\text{Temporary Buffers}
}
\]

对于 7B 模型：

\[
16N = 7B \times 16 = 112GB
\]

所以：

\[
\boxed{
\text{7B 全参数训练显存}
\approx
112GB
+
\text{activation}
+
\text{buffer}
}
\]

这就是为什么全参数训练 7B 模型通常不能直接在单张 24GB 或 48GB 显卡上完成。

---

## 6. 推理显存怎么计算？

推理时不需要反向传播，所以没有梯度，也不需要优化器状态。

推理显存大致是：

\[
\boxed{
\text{Inference Memory}
=
\text{Weights}
+
\text{KV Cache}
+
\text{Activation Buffer}
+
\text{Runtime Buffer}
}
\]

和训练相比，推理少了：

\[
\text{Gradients}
+
\text{Optimizer States}
+
\text{Saved Activations for Backward}
\]

所以推理显存小很多。

---

## 6.1 推理权重显存

仍然使用：

\[
\text{weights} = N \times b
\]

以 7B 模型为例：

| 精度 | 每参数字节 | 权重显存 |
|---|---:|---:|
| FP32 | 4 bytes | 28GB |
| FP16 / BF16 | 2 bytes | 14GB |
| FP8 | 1 byte | 7GB |
| INT4 | 0.5 byte | 3.5GB |

---

## 6.2 推理中的 KV cache

对于 decoder-only LLM，推理时会缓存每一层的 Key 和 Value。

每生成一个 token，每层都需要缓存：

\[
K,\quad V
\]

KV cache 大小大致是：

\[
\boxed{
\text{KV Cache}
=
B \times T \times L \times 2 \times H_{\text{kv}} \times b
}
\]

其中：

| 符号 | 含义 |
|---|---|
| \(B\) | batch size |
| \(T\) | context length / 当前序列长度 |
| \(L\) | Transformer 层数 |
| \(2\) | Key 和 Value 两份 |
| \(H_{\text{kv}}\) | KV 的 hidden 维度 |
| \(b\) | 每个元素占多少 bytes |

如果是普通 multi-head attention，通常可以近似认为：

\[
H_{\text{kv}} \approx H
\]

于是：

\[
\boxed{
\text{KV Cache}
\approx
B \times T \times L \times 2 \times H \times b
}
\]

---

## 7. LLaMA-7B 风格例子

假设：

| 参数 | 数值 |
|---|---:|
| batch size \(B\) | 1 |
| sequence length \(T\) | 4096 |
| layers \(L\) | 32 |
| hidden size \(H\) | 4096 |
| KV dtype | FP16 |
| 每个元素 \(b\) | 2 bytes |

那么：

\[
\text{KV Cache}
=
1 \times 4096 \times 32 \times 2 \times 4096 \times 2
\]

逐步计算：

\[
4096 \times 32 = 131072
\]

\[
131072 \times 2 = 262144
\]

\[
262144 \times 4096 = 1073741824
\]

\[
1073741824 \times 2
=
2147483648 \text{ bytes}
\]

约等于：

\[
\boxed{2 \text{ GiB} \approx 2.15 \text{ GB}}
\]

因此，7B 模型 FP16 推理时：

\[
\text{weights} \approx 14GB
\]

\[
\text{KV Cache} \approx 2GB
\]

再加 runtime buffer，实际可能接近：

\[
16GB \sim 20GB
\]

所以 7B FP16 推理时，16GB 显存有时会比较紧张，24GB 显存会更舒服。

---

## 8. 为什么长上下文推理显存会变大？

KV cache 随上下文长度 \(T\) 线性增长：

\[
\boxed{
\text{KV Cache} \propto T
}
\]

如果上下文从 4096 tokens 增加到 32768 tokens：

\[
\frac{32768}{4096} = 8
\]

KV cache 会变成 8 倍。

前面 4096 tokens 时 KV cache 约为 2GB，那么 32768 tokens 时：

\[
2GB \times 8 = 16GB
\]

这还只是 batch size = 1。

如果 batch size = 4：

\[
16GB \times 4 = 64GB
\]

所以长上下文推理时，KV cache 可能成为主要显存瓶颈。

---

## 9. 训练和推理显存对比

以 7B 模型为例。

### 推理，FP16

权重大约：

\[
14GB
\]

KV cache 取决于上下文长度和 batch size，可能是：

\[
2GB \sim \text{几十 GB}
\]

所以：

\[
\boxed{
\text{Inference Memory}
\approx
14GB
+
\text{KV Cache}
+
\text{Buffer}
}
\]

---

### 全参数训练，Adam 混合精度

参数相关部分：

\[
112GB
\]

再加 activation 和 buffer：

\[
\boxed{
\text{Training Memory}
\approx
112GB
+
\text{Activation}
+
\text{Buffer}
}
\]

这就是训练比推理贵很多的原因。

---

## 10. LoRA / QLoRA 微调时显存怎么算？

全参数训练很贵，但 LoRA / QLoRA 显存会小很多。

---

## 10.1 LoRA

LoRA 冻结原始模型权重，只训练很小的低秩矩阵。

原始权重是：

\[
W
\]

LoRA 训练的是：

\[
\Delta W = BA
\]

其中：

\[
A \in \mathbb R^{r \times d}
\]

\[
B \in \mathbb R^{d \times r}
\]

\(r\) 是低秩维度，通常很小，例如 8、16、64。

LoRA 训练时：

- base model 权重需要放在显存中；
- base model 通常不需要梯度；
- base model 不需要 Adam states；
- 只有 LoRA 参数需要梯度和优化器状态。

所以：

\[
\boxed{
\text{LoRA Memory}
\approx
\text{Base Weights}
+
\text{LoRA Params/Grad/Optimizer}
+
\text{Activations}
}
\]

相比全参数训练，LoRA 省掉了大量 base model 的梯度和优化器状态。

---

## 10.2 QLoRA

QLoRA 进一步把 base model 用 4-bit 量化存储。

比如 7B base model：

\[
7B \times 0.5 = 3.5GB
\]

加上 scale、metadata 等，实际可能约 4GB 左右。

QLoRA 只训练 LoRA 参数，所以：

\[
\boxed{
\text{QLoRA Memory}
\approx
\text{4-bit Base Weights}
+
\text{LoRA Params/Grad/Optimizer}
+
\text{Activations}
}
\]

这就是为什么一张消费级显卡也能微调 7B 甚至更大的模型。

---

## 11. 总结表

### 训练显存

\[
\boxed{
\text{Training Memory}
=
\text{Weights}
+
\text{Gradients}
+
\text{Optimizer States}
+
\text{Activations}
+
\text{Buffers}
}
\]

| 组成 | 是否需要 | 说明 |
|---|---|---|
| 权重 | 需要 | 模型参数 |
| 梯度 | 需要 | backward 更新参数 |
| 优化器状态 | 需要 | Adam 的 \(m,v\) 很占显存 |
| activation | 需要 | backward 要用 |
| KV cache | 一般不按推理形式使用 | 训练通常并行处理序列 |
| buffer | 需要 | CUDA/kernel 临时空间 |

---

### 推理显存

\[
\boxed{
\text{Inference Memory}
=
\text{Weights}
+
\text{KV Cache}
+
\text{Activation Buffer}
+
\text{Buffers}
}
\]

| 组成 | 是否需要 | 说明 |
|---|---|---|
| 权重 | 需要 | 模型参数 |
| 梯度 | 不需要 | 不做 backward |
| 优化器状态 | 不需要 | 不更新参数 |
| activation | 少量需要 | 用完可释放 |
| KV cache | 需要 | decoder-only LLM 长上下文关键瓶颈 |
| buffer | 需要 | 临时计算空间 |

---

## 12. 最重要的记忆版

训练显存：

\[
\boxed{
\text{训练} \approx 16N + \text{activations}
}
\]

这里的 \(16N\) 是 Adam 混合精度全参数训练的大致参数相关开销。

推理显存：

\[
\boxed{
\text{推理} \approx N \times b + \text{KV cache}
}
\]

其中：

\[
\boxed{
\text{KV cache}
\approx
B \times T \times L \times 2 \times H \times b
}
\]

一句话总结：

> **训练贵在梯度、优化器状态、activation；推理贵在权重和 KV cache。**
