# System identification from input-output data

*Technical report - System Lab browser application*

## Abstract

A browser-based workbench simulates first- and second-order processes, imports input-output data, estimates ARX models and validates free-run predictions on later samples. A documented synthetic second-order record provides a reproducible import example. ARX(2,2,1) reaches 89.25% validation fit; ARX(4,4,1) reaches 98.13% on the same held-out segment.

## 1. Scope and process models

The GUI provides live unit-step responses and adjustable process parameters. The continuous-time models are

$$G_1(s)=\frac{K}{\tau s+1}\tag{1}$$

$$G_2(s)=\frac{K\omega_n^2}{s^2+2\zeta\omega_n s+\omega_n^2}\tag{2}$$

The first-order response uses an exact zero-order-hold update. The second-order state equations use fourth-order Runge-Kutta with eight substeps per sample. Gaussian noise is added to the reported output.

## 2. Imported record

The supplied CSV has 401 rows from 0.0 to 40.0 s at 0.1 s intervals, with `time,input,output` columns. It was generated outside the GUI from (2) with $K=1.8$, $\zeta=0.45$ and $\omega_n=2.1\,\mathrm{rad/s}$. The input switches among −1.0, −0.4, 0.4 and 1.0, each held for 0.8–1.5 s. Output noise has standard deviation 0.018; random seed 1729. It is a controlled synthetic benchmark, not a physical measurement. The GUI's process sliders do not change an imported record.

## 3. ARX identification

For ARX$(2,2,1)$, the fitted equation is

$$y[k]+a_1y[k-1]+a_2y[k-2]=b_1u[k-1]+b_2u[k-2]+e[k].$$

The orders $n_a$, $n_b$ and $n_k$ count previous output terms, previous input terms and the initial input delay. Coefficients are estimated by regularized least squares on the first 70% of the record. The final 30% is predicted recursively, using previous predicted outputs after the boundary.

## 4. Estimated ARX(2,2,1) model

The fitted coefficients are $a_1=-1.736632$, $a_2=0.778946$, $b_1=0.048327$ and $b_2=0.034349$. The resulting discrete transfer function is

$$G(z)\approx\frac{0.0483z^{-1}+0.0343z^{-2}}{1-1.7366z^{-1}+0.7789z^{-2}}.\tag{3}$$

## 5. Validation measure

The residual is $r[k]=y[k]-\hat y[k]$; RMSE is its root mean square in output units. The displayed fit is

$$\mathrm{Fit}=100\%\left(1-\frac{\mathrm{RMSE}}{\sigma_{y,\mathrm{val}}}\right).\tag{4}$$

where $\sigma_{y,\mathrm{val}}$ is the standard deviation of held-out output. This is response agreement, not classification accuracy.

## 6. Results and comparison of model orders

The first 280 samples define the training portion; the final 121 start at 28.0 s. Metrics below were computed from the rounded CSV with the GUI's split and regularization.

| ARX order | Validation fit | RMSE | Residual lag-1 correlation |
|:--|--:|--:|--:|
| (1,1,1) | 46.29% | 0.6584 | 0.972 |
| (2,2,1) | 89.25% | 0.1318 | 0.951 |
| (4,4,1) | 98.13% | 0.0229 | 0.202 |

ARX(1,1,1) misses substantial dynamics. ARX(2,2,1) captures the main response but leaves correlated residuals. ARX(4,4,1) lowers error on this held-out interval; that does not make the physical system fourth order or prove it will generalize to another input.

## 7. Interpretation and limits

The GUI lets the user vary process parameters, input shape, noise, sampling interval and ARX order. A varied input often reveals more dynamics; sparse sampling can miss rapid changes. These are tendencies to inspect in the live plots. Noisy lagged outputs can bias ARX least squares. The 70/30 split checks later samples of the same experiment, not a new operating condition.

**Live demonstration:** show both step responses, import the supplied CSV, fit ARX(2,2,1), interpret the transfer function and held-out plots, compare with ARX(4,4,1), then run a new simulation after changing the input or noise.
