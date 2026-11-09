# System Lab

System Lab is a small, interactive workbench for system identification. Give a dynamic system an input, observe its output, fit an ARX model, and check whether that model predicts measurements it has not seen. You can simulate a known first- or second-order system, or import a CSV from another experiment.

It is a local browser app. There is no build step, account, external library, or server-side calculation.

## Run

Open `index.html` in a modern browser. If your browser does not allow local CSV imports from a file page, run `./start.sh` in this folder and open `http://localhost:8000`.

## Follow the experiment

1. **Start with data.** Select a first- or second-order system to simulate, or import a CSV. The system selector controls only newly simulated data. Importing uses the values already in the file.
2. **Set up the simulation.** If simulating, choose an input and adjust sampling time, noise, and duration. The live preview shows the response before you generate measurements. This step is skipped for imported data.
3. **Fit an ARX model.** Choose Simple (1/1), Balanced (2/2), Flexible (4/4), or enter `na`, `nb`, and `nk` yourself. The first-order simulator starts with Simple; the second-order simulator starts with Balanced. An imported CSV starts with Simple because its physical order is not encoded in the file.
4. **Check the prediction.** The app fits coefficients on the first 70% of the record, then predicts the remaining 30%. The final view shows measured and predicted output, fit percentage, error size, residuals, and the estimated discrete transfer function. You can change the model order and compare again.

The step sequence used by the simulator changes the input several times. Even a first-order system can produce a graph that rises and falls under that input. To see the defining shape of its response, look at the single-step preview on the first screen: a first-order response approaches its final level without overshoot.

## Import data

A CSV needs three columns: `time`, `input`, and `output`. Time must increase with roughly equal spacing between samples. A headerless file also works when those are its first three columns. The app does not alter imported measurements or infer their physical order from the filename.

Two example files are included:

| File | Process used to produce the output | Suggested ARX order | Held-out fit |
| --- | --- | --- | --- |
| `sample_first_order_40s.csv` | First-order, `K = 1.8`, `τ = 1.2 s` | (1, 1, 1) | About 96.7% |
| `sample_second_order_40s.csv` | Second-order, `K = 1.8`, `ζ = 0.45`, `ωₙ = 2.1 rad/s` | (2, 2, 1) | About 89.3% |

Both files contain 401 samples over 40 seconds and have **identical time and input columns**. Only the output differs because it came from a different process equation. The companion `*_notes.md` files record the generation method and parameters. These are synthetic examples, not physical measurements.

## What the model calculates

ARX predicts the next output from past outputs and delayed inputs:

```text
y[k] + a₁y[k−1] + ⋯ + aₙₐy[k−na]
     = b₁u[k−nk] + ⋯ + bₙᵦu[k−nk−nb+1] + e[k]
```

`na` is the number of past output terms, `nb` is the number of input terms, and `nk` is the input delay in samples. The coefficients are estimated by least squares. Validation is a recursive prediction: after the train/validation boundary, the model uses its own earlier predictions rather than the measured validation outputs. Fit is `100 × (1 − RMSE / standard deviation of validation output)`; residual is measured minus predicted output.

The first-order simulator uses an exact sampled update. The second-order simulator integrates its state equations with fourth-order Runge–Kutta. Both can add Gaussian measurement noise. The app fits ARX models; it does not automatically determine the physical order of an imported process.

## Files

- `index.html`, `styles.css`, `app.js` — complete app source
- `start.sh` — optional local server
- `sample_*_40s.csv` and `sample_*_40s_notes.md` — example measurements and provenance
- `Technical Report.md`, `System_Lab_Technical_Report.pdf` — methodology, results, and observations

The app runs entirely in the browser and does not upload imported CSVs.
