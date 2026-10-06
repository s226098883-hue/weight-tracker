# WeightTrack

A simple weight tracker that runs in your browser and can be added to your iPhone Home Screen like an app.

- **Today** – your target weight with a progress bar (still to lose, per week, days left), this week's target (still to lose, per day, days left), your latest weigh-in with 7-day and 30-day changes and a 30-day graph, and your BMI with the healthy weight range for your height. The **+** button adds a weigh-in.
- **History** – every weigh-in by month, with the change from the one before.
- **Progress** – graphs for 1 month to all time: your weigh-ins, the 7-day average and your target; the change each week; and your monthly average. Every graph also has a table view.
- **Settings** – GitHub sync, height, target weight, weekly target, light/dark mode, backups and spreadsheet export.

## Your data

Your weigh-ins are saved in your browser. Turn on **Settings → GitHub sync** to also save them to a private repository in your own GitHub account (`weight-tracker-data`). Then nothing is lost if the browser forgets its data or the app is updated, every device you connect shows the same data, and GitHub keeps every earlier version.

Your data is never stored in this (public) app repository.

## Live app

https://s226098883-hue.github.io/weight-tracker/

## Add it to your iPhone

Open the link in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.

## Files

| File | What it does |
|---|---|
| `index.html` | The page and the bottom tab bar |
| `styles.css` | Look and feel (light and dark mode) |
| `app.js` | Screens, forms, targets, BMI |
| `store.js` | Saving data, upgrades, merging changes, weight maths, sample data |
| `sync.js` | GitHub sync |
| `charts.js` | The graphs |
| `sw.js` | Lets the app open without internet |
| `manifest.webmanifest` and the `.png` files | App name and icons for the Home Screen |
