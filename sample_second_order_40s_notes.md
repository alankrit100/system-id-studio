# Sample second-order dataset: source and use

The companion CSV is a **physics-based synthetic dataset**, not AI-generated data or a physical sensor recording. It was generated outside System Lab so the CSV import workflow can be demonstrated honestly.

| Item | Value |
| --- | --- |
| File | `sample_second_order_40s.csv` |
| Columns | `time,input,output` |
| Samples | 401 |
| Sampling interval | 0.1 seconds |
| Time range | 0.0–40.0 seconds |
| System | Second-order process |
| Gain `K` | 1.8 |
| Damping ratio `ζ` | 0.45 |
| Natural frequency `ωₙ` | 2.1 rad/s |
| Initial position and velocity | 0 |
| Input | Multi-level steps at −1.0, −0.4, 0.4, and 1.0; each level held for 0.8–1.5 seconds |
| Measurement noise | Independent Gaussian noise with standard deviation 0.018 output units |
| Random seed | 1729, for reproducibility |

The continuous-time system is

```text
G(s) = K ωₙ² / (s² + 2ζωₙs + ωₙ²)
```

Its state equations were integrated with fourth-order Runge–Kutta using eight substeps per recorded sample. The input was held constant between samples. The output column is the simulated position plus measurement noise.

The companion `sample_first_order_40s.csv` uses the same time points and input values. Comparing their output columns shows the effect of changing system dynamics, apart from small independent measurement noise.

## Demo in System Lab

1. On the opening screen, select **Import existing CSV**. This skips system simulation.
2. Choose `sample_second_order_40s.csv`.
3. Select **Balanced** model complexity (ARX `na=2, nb=2, nk=1`); imported CSVs start with **Simple**.
4. Select **Fit the model**. The first 70% of the imported measurements estimate the coefficients; the final 30% validate the free-run prediction.
5. Discuss the shaded validation region, fit score, and residuals.

An independent calculation using the same split gives approximately **89.25% fit** and **0.132 RMSE**. The app can differ slightly because the CSV rounds values and its least-squares solver adds a small regularizer.

**Presentation phrasing:** “This CSV was generated from a documented second-order physical model with a varied input and small measurement noise. It is a known-ground-truth example for checking the identification workflow. It is not a claim of real laboratory measurement.”
