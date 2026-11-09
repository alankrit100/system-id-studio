# First-order comparison dataset

`sample_first_order_40s.csv` is a **physics-based synthetic recording**, not a physical sensor measurement. It uses the **same 401 time points and the exact same input values** as `sample_second_order_40s.csv`. Only the system that generated the output changed, plus a separate small noise sequence. This makes the two files useful for comparing dynamics.

| Item | Value |
| --- | --- |
| Columns | `time,input,output` |
| Time range | 0.0–40.0 s |
| Sampling interval | 0.1 s |
| Samples | 401 |
| First-order transfer function | `G(s) = K / (τs + 1)` |
| Gain `K` | 1.8 |
| Time constant `τ` | 1.2 s |
| Initial output | 0 |
| Input | Identical to the included second-order CSV |
| Output noise | Independent Gaussian measurement noise, standard deviation 0.018 output units |
| Random seed | 1730 |

The ideal response was calculated using the exact zero-order-hold update for a first-order system:

$$x[k]=e^{-\Delta t/\tau}x[k-1]+K\left(1-e^{-\Delta t/\tau}\right)u[k-1].$$

Noise was added to the reported output after each update. The same input applied to the second-order system produces a different output because the underlying dynamics differ.

## Demo

1. On System Lab's opening screen, choose **Import existing CSV** and select `sample_first_order_40s.csv`.
2. Choose **Simple** ARX(1,1,1) and fit it.
3. The held-out fit is about **96.7%** and RMSE about **0.0192** output units using the app's 70/30 split.
4. Import `sample_second_order_40s.csv` and compare its output shape under the same input. The system selector on the opening screen applies only to newly generated data, not imported CSV files.
