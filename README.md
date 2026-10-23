# Training Controllable World Models via Action Influence Maximization

### Sample Efficient Data-Driven Exploration

🤖 **CoRL 2026 Paper**

[📄 Paper](https://arxiv.org/abs/2610.27387) · [🌐 Website](https://princeton-prism.github.io/action-influence-maximization/)

<img width="540" height="405" alt="Action Influence Maximization demo" src="https://github.com/user-attachments/assets/3780b38d-917d-4722-ab1a-180731114119" />

## Abstract

Action-conditioned video generative models trained on successful, goal-directed demonstrations tend to ignore the commanded action, rendering a plausible expert-like future regardless of what is asked of them. We trace this failure to training data that lack sufficient action influence. We analyze this metric and prove that it upper bounds the action influence that any model trained on that data can express.

Expert demonstrations, whose narrow action distributions let next states be predicted without attending to the action, set a low ceiling that no amount of model capacity alone can raise. Raising it requires collecting different data. We introduce Action Influence Maximization (AIM), an algorithm for actively collecting training data for improving dataset action influence.

We compare the performance and data-efficiency of AIM against exploration heuristics and intrinsic-motivation methods on simulated navigation and manipulation tasks. In pixel-based manipulation, AIM is the only method that consistently improves controllability: 500 actively collected episodes added to 3k demonstrations match a world model trained on 300k expert episodes on end-effector controllability, an 85x reduction in data.

> 🐣 **Code coming soon!** Stay tuned.

## Citation

If you find this work useful, please cite:

```bibtex
@inproceedings{bateman2026aim,
  title = {Training Controllable World Models via Action Influence Maximization},
  author = {Bateman, Samuel M. and Yin, Tenny and Zheng, Chongyi and Huang, Lei
            and Wang, Brian and Eysenbach, Benjamin and Fernández Fisac, Jaime and Shah, Dhruv},
  booktitle = {Conference on Robot Learning},
  year = {2026},
  url = {https://arxiv.org/abs/2610.27387}
}
```
