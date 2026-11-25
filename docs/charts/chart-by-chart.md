# Chart-by-chart design contract

Generated from `docs/charts/chart-catalog.yaml` on 2026-11-24. Do not hand-edit this file; edit the catalog and regenerate with `python3 scripts/build_chart_docs.py`.

Catalog: **109 charts**, **68 existing**, **41 new**, covering **267 metrics**.

Each section is the implementation contract for one chart. Shared archetype rules live in the design spec; the acceptance list here is the chart-specific gate.

## price.btc — Bitcoin Price

- **Status:** existing
- **Implementation:** in_progress
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** candles
- **Question:** What is BTC price doing with trend and volatility context?
- **Competitor parity:** itc.price, lib.price, coc.price
- **Metrics:** price_btc_usd, price_close_daily, price_close_hourly, price_open_daily, price_high_daily, price_low_daily, price_volume_daily, price_change_pct_daily, price_range_daily, price_sma20_daily, price_sma50_daily, price_sma200_daily, price_ema21_daily
- **Disabled metrics:** price_btc_usd
- **Default metric:** price_close_daily
- **Chart types:** candles, line
- **Panes:** price, volume
- **Axes:** left: USD (linear); volume: BTC (linear)
- **Variants:** candles (Candles: price_close_daily); line (Line: price_close_daily)
- **Default series:** OHLC(price_open_daily, price_high_daily, price_low_daily, price_close_daily, volume price_volume_daily) on left; SMA 20 [price_sma20_daily] on left as line; SMA 50 [price_sma50_daily] on left as line; SMA 200 [price_sma200_daily] on left as line; EMA 21 [price_ema21_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, ma_overlay, range, reset_zoom, saved_layout, screenshot, volume_pane, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Read price direction, trend, volatility and volume in one view.
- What is BTC price doing with trend and volatility context?

**Acceptance:**
- [ ] Candles and line mode show identical close values at every timestamp.
- [ ] Log scale drops or flags non-positive prices instead of plotting at zero.
- [ ] Volume pane shares the time axis and hides cleanly.
- [ ] MA overlays use the selected periods and recalculate on range change.
- [ ] Switching every variant on price.btc preserves range, grain and annotations.
- [ ] Candle OHLC values equal `/api/v1/ohlc/daily` for the same timestamp.
- [ ] Volume matches `price_volume_daily`; hiding volume leaves no empty pane.
- [ ] Halving markers land on 2012-11-28, 2016-07-09, 2020-05-11 and 2024-04-20 UTC.

---

## price.cycle_overlays — Cycle Overlays

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** multi_series
- **Question:** Where are we versus bubble risk and bull support?
- **Competitor parity:** itc.roi_bottom, itc.bubble_risk, itc.bull_support
- **Metrics:** bubble_risk_daily, roi_bottom_daily, bull_support_daily
- **Default metric:** bubble_risk_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: pct (linear)
- **Variants:** bubble (Bubble risk: bubble_risk_daily); roi (ROI after bottom: roi_bottom_daily); support (Bull support: bull_support_daily)
- **Default series:** Bubble risk [bubble_risk_daily] on left as line; ROI after bottom [roi_bottom_daily] on left as line; Bull support [bull_support_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Where are we versus bubble risk and bull support?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on price.cycle_overlays preserves range, grain and annotations.

---

## price.drawdown — Drawdown from ATH

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** How deep is the drawdown and how far below ATH?
- **Competitor parity:** lib.drawdown, coc.drawdown
- **Metrics:** ath_daily, ath_distance_daily, drawdown_daily
- **Default metric:** drawdown_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** drawdown (Drawdown: drawdown_daily); ath_distance (Below ATH: ath_distance_daily)
- **Default series:** Drawdown % [drawdown_daily] on left as area; Below ATH % [ath_distance_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- How deep is the drawdown and how far below ATH?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on price.drawdown preserves range, grain and annotations.
- [ ] Drawdown is 0 at a new ATH and negative otherwise.
- [ ] ATH line equals the running maximum close over the selected history.

---

## price.mayer — Mayer Multiple

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** line_dual_axis
- **Question:** Is price stretched versus its 200D average?
- **Competitor parity:** coc.mayer, lib.mayer
- **Metrics:** mayer_multiple_daily
- **Default metric:** mayer_multiple_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** Mayer [mayer_multiple_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Is price stretched versus its 200D average?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on price.mayer preserves range, grain and annotations.

---

## price.momentum — Price Momentum

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** multi_series
- **Question:** How strong is 30D and YoY performance?
- **Competitor parity:** coc.rolling_performance, itc.momentum
- **Metrics:** price_mom30_daily, price_yoy_daily
- **Default metric:** price_mom30_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: pct (linear)
- **Variants:** m30 (30D: price_mom30_daily); yoy (YoY: price_yoy_daily)
- **Default series:** 30D momentum [price_mom30_daily] on left as line; YoY [price_yoy_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How strong is 30D and YoY performance?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on price.momentum preserves range, grain and annotations.

---

## price.rsi — RSI-14

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** Is momentum overbought or oversold?
- **Competitor parity:** coc.rsi, lib.rsi
- **Metrics:** rsi14_daily
- **Default metric:** rsi14_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: index (linear)
- **Variants:** grain only
- **Default series:** RSI 14 [rsi14_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is momentum overbought or oversold?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on price.rsi preserves range, grain and annotations.

---

## price.sharpe — Sharpe Proxy 30D

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** Is risk-adjusted return improving?
- **Competitor parity:** coc.sharpe, lib.sharpe
- **Metrics:** price_sharpe_proxy_daily
- **Default metric:** price_sharpe_proxy_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** Sharpe 30D [price_sharpe_proxy_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is risk-adjusted return improving?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on price.sharpe preserves range, grain and annotations.

---

## price.volatility — Realized Volatility 30D

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_2_price
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** How volatile is BTC versus its own history?
- **Competitor parity:** coc.volatility, lib.volatility
- **Metrics:** volatility30_daily
- **Default metric:** volatility30_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** Vol 30D [volatility30_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- How volatile is BTC versus its own history?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on price.volatility preserves range, grain and annotations.

---

## valuation.aviv — AVIV Ratio

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** What does Cointime cost basis say about valuation?
- **Competitor parity:** coc.aviv
- **Metrics:** aviv_daily
- **Default metric:** aviv_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** AVIV [aviv_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- What does Cointime cost basis say about valuation?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on valuation.aviv preserves range, grain and annotations.

---

## valuation.cap_models — Cap Models: Average, Top, Delta, Balanced, CVDD

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** bands_overlay
- **Question:** Where are the classic onchain price floors?
- **Competitor parity:** lib.cvdd, lib.top_cap, coc.cost_basis
- **Metrics:** realized_price_daily, avg_cap_daily, top_cap_daily, delta_cap_daily, balanced_proxy_daily, cvdd_proxy_daily
- **Default metric:** realized_price_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: USD (linear); right: USD (log)
- **Variants:** realized_price (Realized Price: realized_price_daily); balanced (Balanced: balanced_proxy_daily); cvdd (CVDD: cvdd_proxy_daily); top (Top Cap: top_cap_daily); delta (Delta Cap: delta_cap_daily); avg (Average Cap: avg_cap_daily)
- **Default series:** Realized price [realized_price_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Where are the classic onchain price floors?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on valuation.cap_models preserves range, grain and annotations.

---

## valuation.lth — LTH MVRV & Cost Basis

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_dual_axis
- **Question:** Are long-term holders in profit or loss?
- **Competitor parity:** coc.lth_mvrv, lib.lth_mvrv
- **Metrics:** lth_mvrv_daily, lth_realized_price_daily
- **Default metric:** lth_mvrv_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** mvrv (LTH MVRV: lth_mvrv_daily); cost (LTH Cost Basis: lth_realized_price_daily)
- **Default series:** LTH MVRV [lth_mvrv_daily] on left as line; LTH cost basis [lth_realized_price_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Are long-term holders in profit or loss?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on valuation.lth preserves range, grain and annotations.
- [ ] LTH cost basis reconciles with realized cap minus STH value.
- [ ] LTH supply plus STH supply equals circulating supply within rounding.

---

## valuation.mvrv — MVRV / Z-Score / Momentum

- **Status:** existing
- **Implementation:** in_progress
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** bands_overlay
- **Question:** Is BTC cheap or expensive versus realized cost basis?
- **Competitor parity:** itc.mvrv_z, lib.mvrv_zscore, coc.mvrv
- **Metrics:** mvrv_daily, mvrv_weekly, mvrv_sma30_daily, mvrv_z_daily, mvrv_z_2yr_daily, mvrv_momentum_daily
- **Default metric:** mvrv_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** mvrv (MVRV: mvrv_daily, mvrv_sma30_daily); z (Z-Score: mvrv_z_daily); z2y (Z-Score 2Y: mvrv_z_2yr_daily); momentum (Momentum: mvrv_momentum_daily)
- **Default series:** MVRV [mvrv_daily] on left as line; MVRV SMA30 [mvrv_sma30_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Is BTC cheap or expensive versus realized cost basis?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on valuation.mvrv preserves range, grain and annotations.
- [ ] MVRV equals market cap / realized cap within 0.1%.
- [ ] Z-score window defaults to 4Y and is labelled.
- [ ] Band quantiles change only when the quantile window changes.

---

## valuation.nupl — NUPL

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_oscillator
- **Question:** Is the market in net unrealized profit or loss?
- **Competitor parity:** lib.nupl, coc.nupl
- **Metrics:** nupl_daily, nupl_weekly, nupl_sma7_daily
- **Default metric:** nupl_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** NUPL [nupl_daily] on left as line; NUPL SMA7 [nupl_sma7_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is the market in net unrealized profit or loss?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on valuation.nupl preserves range, grain and annotations.

---

## valuation.realized_cap — Realized Cap vs Market Cap

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_dual_axis
- **Question:** How much capital is stored onchain versus market value?
- **Competitor parity:** coc.realised_cap, lib.realized_cap
- **Metrics:** realized_cap_daily, realized_cap_weekly, realized_cap_sma30_daily, market_cap_daily, market_cap_sma30_daily, thermocap_daily
- **Default metric:** realized_cap_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: USD (linear)
- **Variants:** caps (Market vs Realized: market_cap_daily, realized_cap_daily); thermo (Thermocap: thermocap_daily, realized_cap_daily); change (30D Change: realized_cap_sma30_daily)
- **Default series:** Market cap [market_cap_daily] on left as line; Realized cap [realized_cap_daily] on left as line; Thermocap [thermocap_daily] on left as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How much capital is stored onchain versus market value?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on valuation.realized_cap preserves range, grain and annotations.
- [ ] Market cap, realized cap and thermocap use the same daily price source.
- [ ] 30D change reconciles with the difference between the current and 30-day-lagged value.

---

## valuation.realized_price — Realized Price

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_dual_axis
- **Question:** Where is the market cost basis?
- **Competitor parity:** lib.realized_price, coc.realised_price
- **Metrics:** realized_price_daily
- **Default metric:** realized_price_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: USD (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** Realized price [realized_price_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Where is the market cost basis?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on valuation.realized_price preserves range, grain and annotations.

---

## valuation.risk_ratios — Reserve Risk & RHODL

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** multi_series
- **Question:** Is HODL conviction high or is fast money dominating?
- **Competitor parity:** coc.reserve_risk, lib.rhodl
- **Metrics:** reserve_risk_proxy_daily, rhodl_proxy_daily
- **Default metric:** reserve_risk_proxy_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: risk (linear)
- **Variants:** reserve (Reserve Risk: reserve_risk_proxy_daily); rhodl (RHODL: rhodl_proxy_daily)
- **Default series:** Reserve risk [reserve_risk_proxy_daily] on left as line; RHODL [rhodl_proxy_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Is HODL conviction high or is fast money dominating?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on valuation.risk_ratios preserves range, grain and annotations.

---

## valuation.sth — STH MVRV & Cost Basis

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_3_valuation
- **Priority:** P0
- **Archetype:** line_dual_axis
- **Question:** Are short-term holders in profit or loss?
- **Competitor parity:** coc.sth_mvrv, lib.sth_mvrv
- **Metrics:** sth_mvrv_daily, sth_realized_price_daily
- **Default metric:** sth_mvrv_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** mvrv (STH MVRV: sth_mvrv_daily); cost (STH Cost Basis: sth_realized_price_daily)
- **Default series:** STH MVRV [sth_mvrv_daily] on left as line; STH cost basis [sth_realized_price_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Are short-term holders in profit or loss?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on valuation.sth preserves range, grain and annotations.
- [ ] STH cost basis uses the documented 155-day age boundary.
- [ ] STH supply plus LTH supply equals circulating supply within rounding.

---

## profitability.puell — Puell Multiple

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_4_profitability_risk
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** Are miners earning above or below their annual average?
- **Competitor parity:** lib.puell, coc.puell
- **Metrics:** puell_daily, puell_weekly, puell_sma30_daily
- **Default metric:** puell_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** puell (Puell: puell_daily); sma30 (Puell SMA30: puell_sma30_daily)
- **Default series:** Puell [puell_daily] on left as line; Puell SMA30 [puell_sma30_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Are miners earning above or below their annual average?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on profitability.puell preserves range, grain and annotations.

---

## profitability.sopr — SOPR

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_4_profitability_risk
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** Are coins moving at profit or loss?
- **Competitor parity:** lib.sopr, coc.sopr
- **Metrics:** sopr_daily, sopr_weekly, sopr_sma7_daily
- **Default metric:** sopr_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** sopr (SOPR: sopr_daily); sma7 (SOPR SMA7: sopr_sma7_daily)
- **Default series:** SOPR [sopr_daily] on left as line; SOPR SMA7 [sopr_sma7_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Are coins moving at profit or loss?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on profitability.sopr preserves range, grain and annotations.
- [ ] SOPR = 1 threshold is visible and labelled.
- [ ] SOPR SMA7 uses the prior 7 daily values.

---

## risk.composite — Risk Composite

- **Status:** existing
- **Implementation:** in_progress
- **Phase:** phase_4_profitability_risk
- **Priority:** P0
- **Archetype:** gauge_composite
- **Question:** What is the overall risk regime and which components drive it?
- **Competitor parity:** itc.risk, lib.risk
- **Metrics:** risk_daily, risk_weekly, risk_sma7_daily, risk_mvrv_daily, risk_nupl_daily, risk_sopr_daily, risk_puell_daily, risk_mayer_daily
- **Default metric:** risk_daily
- **Chart types:** gauge, line
- **Panes:** gauge, history
- **Axes:** gauge: score (linear); left: score (linear)
- **Variants:** composite (Composite: risk_daily, risk_sma7_daily); components (Components: risk_mvrv_daily, risk_nupl_daily, risk_sopr_daily, risk_puell_daily, risk_mayer_daily)
- **Default series:** Risk composite [risk_daily] on gauge as line; Risk SMA7 [risk_sma7_daily] on gauge as line
- **Controls:** components, fullscreen, grain, history_toggle, range, screenshot, thresholds
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Give one number for the current regime plus the evidence behind it.
- What is the overall risk regime and which components drive it?

**Acceptance:**
- [ ] Gauge bands and labels match the metric definition.
- [ ] Component contributions are visible and sum correctly.
- [ ] History toggle shows the same value over time.
- [ ] Switching every variant on risk.composite preserves range, grain and annotations.
- [ ] Component weights sum to 1.0 and the composite stays in 0-100.
- [ ] Regime thresholds match the description: <35 risk-off, 35-60 neutral, >60 risk-on.

---

## cycle.200w — 200W MA + Heatmap

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_5_cycle
- **Priority:** P0
- **Archetype:** heatmap
- **Question:** Is price above or below the 200W MA, and how heated is it?
- **Competitor parity:** lib.200w_heatmap, coc.200w_quantiles
- **Metrics:** ma200w_daily, heat_200w_daily
- **Default metric:** ma200w_daily
- **Chart types:** heatmap
- **Panes:** heatmap
- **Axes:** x: date (linear); y: USD (log); color: ratio (linear)
- **Variants:** line (200W MA: ma200w_daily); heat (Heatmap: heat_200w_daily)
- **Default series:** BTC price [price_close_daily] on y as line; 200W MA [ma200w_daily] on y as line; 200W heat [heat_200w_daily] on color as heat
- **Controls:** bin_size, color_scale, csv, fullscreen, hover_detail, log_color, range, reset_zoom, saved_layout, screenshot, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Reveal how a two-dimensional distribution changes over time.
- Is price above or below the 200W MA, and how heated is it?

**Acceptance:**
- [ ] Colour scale legend shows units and min/max.
- [ ] Empty bins render as background, not zero-colour.
- [ ] Hover reports date, bin range and value.
- [ ] Switching every variant on cycle.200w preserves range, grain and annotations.
- [ ] Heat colour equals price / 200W MA, not price alone.
- [ ] Log price axis and linear heat scale are labelled separately.

---

## cycle.2y — 2Y MA, 5x Bands, Golden 1.6

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_5_cycle
- **Priority:** P0
- **Archetype:** bands_overlay
- **Question:** Where is price versus the 2Y cycle mean and multiples?
- **Competitor parity:** coc.magic_lines, lib.2y_ma
- **Metrics:** ma2y_daily, ma2y_x5_daily, golden_161_daily
- **Default metric:** ma2y_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** right: USD (log)
- **Variants:** ma2y (2Y MA: ma2y_daily); x5 (2Y x5: ma2y_x5_daily); golden (Golden 1.6: golden_161_daily)
- **Default series:** BTC price [price_close_daily] on right as line; 2Y MA [ma2y_daily] on right as line; 2Y x5 [ma2y_x5_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Where is price versus the 2Y cycle mean and multiples?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on cycle.2y preserves range, grain and annotations.

---

## cycle.bmsb — Bull Market Support Band

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_5_cycle
- **Priority:** P0
- **Archetype:** bands_overlay
- **Question:** Is price holding the 20W SMA / 21W EMA support band?
- **Competitor parity:** itc.bull_support, lib.bmsb
- **Metrics:** bmsb_20w_daily, bmsb_21w_daily
- **Default metric:** bmsb_20w_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** right: USD (log)
- **Variants:** band (20W / 21W: bmsb_20w_daily, bmsb_21w_daily)
- **Default series:** BTC price [price_close_daily] on right as line; 20W SMA [bmsb_20w_daily] on right as line; 21W EMA proxy [bmsb_21w_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Is price holding the 20W SMA / 21W EMA support band?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on cycle.bmsb preserves range, grain and annotations.
- [ ] 20W SMA and 21W EMA proxy are labelled as proxy.
- [ ] Price cross above/below the band is marked.

---

## cycle.pi — Pi Cycle Top

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_5_cycle
- **Priority:** P0
- **Archetype:** multi_series
- **Question:** Are the Pi Cycle averages crossing?
- **Competitor parity:** lib.pi_cycle, coc.pi_cycle
- **Metrics:** pi_111_daily, pi_350x2_daily, pi_oscillator_daily
- **Default metric:** pi_111_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** right: USD (log)
- **Variants:** averages (111DMA vs 350DMAx2: pi_111_daily, pi_350x2_daily); osc (Oscillator: pi_oscillator_daily)
- **Default series:** 111DMA [pi_111_daily] on right as line; 350DMA x2 [pi_350x2_daily] on right as line; BTC price [price_close_daily] on right as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Are the Pi Cycle averages crossing?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on cycle.pi preserves range, grain and annotations.
- [ ] Crossover marker appears when 111DMA crosses 350DMAx2.
- [ ] Oscillator equals 111DMA / (350DMA x2) or the documented formula.

---

## cycle.powerlaw — Power Law & Log Regression

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_5_cycle
- **Priority:** P0
- **Archetype:** bands_overlay
- **Question:** Where is price versus its long-run power-law channel?
- **Competitor parity:** itc.log_regression, lib.power_law, coc.power_law
- **Metrics:** powerlaw_fair_daily, logreg_upper_daily, logreg_lower_daily
- **Default metric:** powerlaw_fair_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** right: USD (log)
- **Variants:** fair (Fair Value: powerlaw_fair_daily); channel (Log Channel: logreg_upper_daily, logreg_lower_daily)
- **Default series:** BTC price [price_close_daily] on right as line; Fair value [powerlaw_fair_daily] on right as line; Upper band [logreg_upper_daily] on right as line; Lower band [logreg_lower_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Where is price versus its long-run power-law channel?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on cycle.powerlaw preserves range, grain and annotations.
- [ ] Fair value and channel bounds use the documented formula.
- [ ] Channel fill breaks when any bound is null.

---

## issuance.s2f — Stock-to-Flow

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** Where is price versus the S2F model?
- **Competitor parity:** lib.s2f, coc.inflation_s2f
- **Metrics:** s2f_daily, s2f_fair_daily
- **Default metric:** s2f_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** S2F [s2f_daily] on left as line; S2F fair value [s2f_fair_daily] on right as line; BTC price [price_close_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Where is price versus the S2F model?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on issuance.s2f preserves range, grain and annotations.
- [ ] S2F equals supply / annual issuance.
- [ ] Halving step-down is visible at each halving.

---

## issuance.schedule — Issuance & Halving Schedule

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** When is the next halving and how does subsidy step down?
- **Competitor parity:** lib.issuance, coc.inflation_s2f
- **Metrics:** subsidy_daily, height_daily, halving_countdown_daily
- **Default metric:** subsidy_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: BTC (linear); right: days (log)
- **Variants:** subsidy (Subsidy: subsidy_daily); height (Height: height_daily); countdown (Halving Countdown: halving_countdown_daily)
- **Default series:** Subsidy BTC [subsidy_daily] on left as bar; Days to halving [halving_countdown_daily] on right as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- When is the next halving and how does subsidy step down?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on issuance.schedule preserves range, grain and annotations.

---

## supply.circulating — Circulating Supply & Inflation

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** How much supply exists and how fast is it growing?
- **Competitor parity:** lib.circulating_supply, coc.circulating_issuance
- **Metrics:** supply_daily, supply_issued_daily, inflation_annual_daily
- **Default metric:** supply_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: BTC (linear); right: ratio (log)
- **Variants:** grain only
- **Default series:** Supply [supply_daily] on left as line; Issued [supply_issued_daily] on left as bar; Annual inflation % [inflation_annual_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How much supply exists and how fast is it growing?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on supply.circulating preserves range, grain and annotations.

---

## supply.cohorts — STH / LTH Supply

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** Who holds the supply: short-term or long-term?
- **Competitor parity:** coc.sth_lth_supply, lib.sth_lth_supply
- **Metrics:** sth_supply_daily, lth_supply_daily, sth_lth_ratio_daily
- **Default metric:** sth_supply_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** supply (Supply: sth_supply_daily, lth_supply_daily); ratio (Ratio: sth_lth_ratio_daily)
- **Default series:** STH supply [sth_supply_daily] on left as area; LTH supply [lth_supply_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- Who holds the supply: short-term or long-term?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on supply.cohorts preserves range, grain and annotations.
- [ ] STH supply plus LTH supply equals supply.
- [ ] Ratio equals STH / LTH.

---

## supply.hodl_waves — HODL Waves

- **Status:** existing
- **Implementation:** in_progress
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** How is supply distributed by coin age?
- **Competitor parity:** lib.hodl_waves, coc.hodl_waves
- **Metrics:** hodl_band_1d_daily, hodl_band_1w_daily, hodl_band_1m_daily, hodl_band_3m_daily, hodl_band_6m_daily, hodl_band_1y_daily, hodl_band_2y_daily, hodl_band_5y_plus_daily, hodl_band_1d_weekly, hodl_band_1w_weekly, hodl_band_1m_weekly, hodl_band_3m_weekly, hodl_band_6m_weekly, hodl_band_1y_weekly, hodl_band_2y_weekly, hodl_band_5y_plus_weekly, hodl_long_share_daily, hodl_short_daily
- **Default metric:** hodl_band_1d_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** absolute (BTC: hodl_band_1d_daily); percent (% of supply: hodl_band_1d_daily); realized (Realized Cap: hodl_band_1d_daily)
- **Default series:** <1d [hodl_band_1d_daily] on left as area; 1d-1w [hodl_band_1w_daily] on left as area; 1w-1m [hodl_band_1m_daily] on left as area; 1m-3m [hodl_band_3m_daily] on left as area; 3m-6m [hodl_band_6m_daily] on left as area; 6m-1y [hodl_band_1y_daily] on left as area; 1y-2y [hodl_band_2y_daily] on left as area; 5y+ [hodl_band_5y_plus_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- How is supply distributed by coin age?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on supply.hodl_waves preserves range, grain and annotations.
- [ ] Age bands sum to circulating supply within rounding.
- [ ] Percent mode sums to 100% of visible bands.
- [ ] Weekly and daily variants preserve the same default range.

---

## supply.long_term — Long-Term Supply

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_6_supply
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** Is supply maturing into long-term hands?
- **Competitor parity:** coc.older_supply, lib.hodl_1y
- **Metrics:** hodl_1y_plus_daily, hodl_1y_plus_weekly, hodl_5y_plus_daily
- **Default metric:** hodl_1y_plus_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** grain only
- **Default series:** 1y+ supply [hodl_1y_plus_daily] on left as line; 5y+ supply [hodl_5y_plus_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Is supply maturing into long-term hands?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on supply.long_term preserves range, grain and annotations.

---

## addresses.activity — Active & New Addresses

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_7_addresses
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** Is network usage growing?
- **Competitor parity:** lib.active_addresses, coc.active_addresses, lib.new_addresses
- **Metrics:** active_addresses_daily, active_addresses_hourly, active_addresses_weekly, active_addresses_sma7_daily, new_addresses_daily, value_per_active_daily, address_activity_daily
- **Legacy aliases:** address_activity_daily
- **Default metric:** active_addresses_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: addresses (linear)
- **Variants:** active (Active: active_addresses_daily); new (New: new_addresses_daily); value (Value per Active: value_per_active_daily)
- **Default series:** Active addresses [active_addresses_daily] on left as line; New addresses [new_addresses_daily] on left as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Is network usage growing?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on addresses.activity preserves range, grain and annotations.
- [ ] Active addresses are not double-counted within a day.
- [ ] Value per active address uses the daily close.

---

## addresses.btc_cohorts — Address Cohorts by BTC Balance

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_7_addresses
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** How many wallets hold at least 1/10/100/1k BTC?
- **Competitor parity:** lib.addresses_gt_btc, coc.address_cohorts
- **Metrics:** addr_gt1_btc_daily, addr_gt10_btc_daily, addr_gt100_btc_daily, addr_gt1000_btc_daily
- **Default metric:** addr_gt1_btc_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: addresses (linear)
- **Variants:** count (Count: addr_gt1_btc_daily, addr_gt10_btc_daily, addr_gt100_btc_daily, addr_gt1000_btc_daily); share (Share: addr_gt1_btc_daily)
- **Default series:** >=1 BTC [addr_gt1_btc_daily] on left as line; >=10 BTC [addr_gt10_btc_daily] on left as line; >=100 BTC [addr_gt100_btc_daily] on left as line; >=1k BTC [addr_gt1000_btc_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How many wallets hold at least 1/10/100/1k BTC?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on addresses.btc_cohorts preserves range, grain and annotations.
- [ ] Counts are monotonic: >=1 BTC >= >=10 BTC >= >=100 BTC >= >=1k BTC.
- [ ] Share mode uses the non-zero address count as denominator.

---

## addresses.outputs — Outputs & Output Value

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_7_addresses
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** How many outputs are created and what are they worth?
- **Competitor parity:** coc.outputs, lib.outputs
- **Metrics:** outputs_count_daily, outputs_count_hourly_proxy, outputs_value_daily, outputs_value_median_daily
- **Default metric:** outputs_count_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: outputs (linear); right: BTC (log)
- **Variants:** count (Outputs: outputs_count_daily); value (Value: outputs_value_daily, outputs_value_median_daily)
- **Default series:** Outputs count [outputs_count_daily] on left as line; Output value BTC [outputs_value_daily] on right as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How many outputs are created and what are they worth?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on addresses.outputs preserves range, grain and annotations.

---

## addresses.profit — Addresses in Profit

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_7_addresses
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** What share of addresses is in profit?
- **Competitor parity:** lib.pct_addresses_profit
- **Metrics:** pct_addresses_in_profit_daily
- **Default metric:** pct_addresses_in_profit_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** % addresses in profit [pct_addresses_in_profit_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- What share of addresses is in profit?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on addresses.profit preserves range, grain and annotations.

---

## addresses.usd_cohorts — Address Cohorts by USD Balance

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_7_addresses
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** How many wallets hold at least $1k/$10k/$100k/$1M?
- **Competitor parity:** lib.addresses_gt_usd
- **Metrics:** addr_gt1k_usd_daily, addr_gt10k_usd_daily, addr_gt100k_usd_daily, addr_gt1m_usd_daily
- **Default metric:** addr_gt1k_usd_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: addresses (linear)
- **Variants:** count (Count: addr_gt1k_usd_daily, addr_gt10k_usd_daily, addr_gt100k_usd_daily, addr_gt1m_usd_daily); share (Share: addr_gt1k_usd_daily)
- **Default series:** >= $1k [addr_gt1k_usd_daily] on left as line; >= $10k [addr_gt10k_usd_daily] on left as line; >= $100k [addr_gt100k_usd_daily] on left as line; >= $1M [addr_gt1m_usd_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How many wallets hold at least $1k/$10k/$100k/$1M?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on addresses.usd_cohorts preserves range, grain and annotations.
- [ ] Counts are monotonic across thresholds.
- [ ] USD thresholds use the daily close and are labelled.

---

## fees.buckets — Fee Rate Buckets

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** How is fee pressure distributed across fee rates?
- **Competitor parity:** coc.fee_buckets
- **Metrics:** fee_bucket_0-1_daily, fee_bucket_1-5_daily, fee_bucket_5-20_daily, fee_bucket_20-100_daily, fee_bucket_100plus_daily, fee_bucket_low_share_daily
- **Default metric:** fee_bucket_0-1_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: tx (linear)
- **Variants:** count (Count: fee_bucket_0-1_daily); share (Share: fee_bucket_low_share_daily)
- **Default series:** 0-1 sat/vB [fee_bucket_0-1_daily] on left as area; 1-5 [fee_bucket_1-5_daily] on left as area; 5-20 [fee_bucket_5-20_daily] on left as area; 20-100 [fee_bucket_20-100_daily] on left as area; 100+ [fee_bucket_100plus_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- How is fee pressure distributed across fee rates?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on fees.buckets preserves range, grain and annotations.
- [ ] Buckets sum to the transaction count within documented tolerance.
- [ ] Share mode sums to 100%.

---

## fees.per_tx — Fee per Transaction / Fee Rate

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** What does a normal transaction pay?
- **Competitor parity:** lib.fee_per_tx, coc.fee_rate
- **Metrics:** fee_per_tx_daily, fee_per_tx_sma7_daily, fee_median_sat_daily, feerate_median_daily, feerate_median_weekly
- **Default metric:** fee_per_tx_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** grain only
- **Default series:** Fee per tx BTC [fee_per_tx_daily] on left as line; Median fee sats [fee_median_sat_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- What does a normal transaction pay?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on fees.per_tx preserves range, grain and annotations.

---

## fees.revenue — Fee Revenue

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** How much are users paying for block space?
- **Competitor parity:** lib.miner_revenue_fees, coc.fee_revenue
- **Metrics:** fees_daily, fees_hourly, fees_weekly, fees_sma7_daily, fees_sma30_daily, fees_cumulative_daily
- **Default metric:** fees_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: BTC (linear); right: USD (log)
- **Variants:** btc (BTC: fees_daily); usd (USD: fees_daily); cumulative (Cumulative: fees_cumulative_daily)
- **Default series:** Fees BTC [fees_daily] on left as bar; SMA7 [fees_sma7_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- How much are users paying for block space?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on fees.revenue preserves range, grain and annotations.
- [ ] Fees are in BTC unless the USD variant is selected.
- [ ] Fee share equals fees / (fees + subsidy).

---

## fees.segwit — SegWit Share

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** How much of activity uses SegWit?
- **Competitor parity:** coc.segwit, lib.segwit
- **Metrics:** segwit_share_daily
- **Default metric:** segwit_share_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** SegWit share [segwit_share_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- How much of activity uses SegWit?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on fees.segwit preserves range, grain and annotations.

---

## fees.tx_count — Transaction Count

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** Is transaction throughput rising?
- **Competitor parity:** lib.tx_count, coc.tx_count
- **Metrics:** tx_count_daily, tx_count_hourly, tx_count_weekly, tx_count_sma7_daily, tx_count_sma30_daily, tx_count_cumulative_daily
- **Default metric:** tx_count_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: tx (linear)
- **Variants:** count (Count: tx_count_daily); cumulative (Cumulative: tx_count_cumulative_daily)
- **Default series:** Tx count [tx_count_daily] on left as bar; SMA7 [tx_count_sma7_daily] on left as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- Is transaction throughput rising?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on fees.tx_count preserves range, grain and annotations.

---

## fees.tx_size — Transaction Size & Weight

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** How large are transactions and how much block weight do they use?
- **Competitor parity:** coc.tx_size
- **Metrics:** tx_size_hourly, tx_size_median_daily, tx_size_median_weekly, tx_weight_median_daily
- **Default metric:** tx_size_median_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: bytes (linear); right: WU (log)
- **Variants:** grain only
- **Default series:** Median size [tx_size_median_daily] on left as line; Median weight [tx_weight_median_daily] on right as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How large are transactions and how much block weight do they use?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on fees.tx_size preserves range, grain and annotations.

---

## fees.value_bands — Transaction Value Bands

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** Who is moving value: dust, retail, institutional, whales?
- **Competitor parity:** coc.transfer_volumes, lib.large_tx
- **Metrics:** value_dust_daily, value_small_daily, value_retail_daily, value_institutional_daily, value_whale_daily, value_median_daily, value_median_weekly, large_tx_daily, large_tx_hourly, large_tx_weekly, large_tx_share_daily, value_dust_btc_daily, value_small_btc_daily, value_retail_btc_daily, value_institutional_btc_daily, value_whale_btc_daily
- **Default metric:** value_dust_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: outputs (linear)
- **Variants:** count (Count: value_dust_daily); btc (BTC: value_dust_btc_daily); share (Share: value_whale_daily)
- **Default series:** Dust [value_dust_daily] on left as area; Small [value_small_daily] on left as area; Retail [value_retail_daily] on left as area; Institutional [value_institutional_daily] on left as area; Whale [value_whale_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- Who is moving value: dust, retail, institutional, whales?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on fees.value_bands preserves range, grain and annotations.
- [ ] Bands sum to transaction count or BTC volume according to variant.
- [ ] Large-tx share uses the documented >10 BTC threshold.

---

## fees.vin_vout — Inputs & Outputs per Tx

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_8_fees
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** Is transaction batching improving?
- **Competitor parity:** coc.vin_vout
- **Metrics:** vin_mean_daily, vin_mean_weekly, vout_mean_daily, vout_mean_weekly
- **Default metric:** vin_mean_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: inputs (linear)
- **Variants:** grain only
- **Default series:** Inputs/tx [vin_mean_daily] on left as line; Outputs/tx [vout_mean_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Is transaction batching improving?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on fees.vin_vout preserves range, grain and annotations.

---

## flow.cdd — Coin Days Destroyed

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** Are old coins moving?
- **Competitor parity:** lib.cdd, coc.cdd
- **Metrics:** cdd_daily, cdd_supply_adjusted_daily
- **Default metric:** cdd_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: BTC-days (linear)
- **Variants:** cdd (CDD: cdd_daily); adjusted (Supply-Adjusted CDD: cdd_supply_adjusted_daily)
- **Default series:** CDD [cdd_daily] on left as bar; Supply-adjusted CDD [cdd_supply_adjusted_daily] on left as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- Are old coins moving?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on flow.cdd preserves range, grain and annotations.
- [ ] CDD equals value x age for spent outputs; formula is documented.
- [ ] Supply-adjusted CDD divides by circulating supply.

---

## flow.etf — ETF Flows

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** Are ETFs accumulating or distributing?
- **Competitor parity:** lib.etf_flows, coc.etf_flows
- **Metrics:** etf_flow_btc_daily, etf_flow_usd_daily, etf_cumulative_btc_daily
- **Default metric:** etf_flow_btc_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: BTC (linear); right: BTC (log)
- **Variants:** btc (BTC Flow: etf_flow_btc_daily); usd (USD Flow: etf_flow_usd_daily); cumulative (Cumulative: etf_cumulative_btc_daily)
- **Default series:** Daily flow BTC [etf_flow_btc_daily] on left as bar; Cumulative BTC [etf_cumulative_btc_daily] on right as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- Are ETFs accumulating or distributing?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on flow.etf preserves range, grain and annotations.
- [ ] Cumulative BTC equals the running sum of daily BTC flows.
- [ ] USD and BTC series use the same flow date.

---

## flow.legacy — Legacy Transfer Volume

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** Legacy alias for transfer volume.
- **Competitor parity:** coc.transfer_volumes
- **Metrics:** tx_volume_hourly
- **Legacy aliases:** tx_volume_hourly
- **Default metric:** tx_volume_hourly
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: tx (linear)
- **Variants:** grain only
- **Default series:** TX volume / hour [tx_volume_hourly] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** hourly

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Legacy alias for transfer volume.

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on flow.legacy preserves range, grain and annotations.

---

## flow.nvt — NVT Ratio

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** bands_overlay
- **Question:** Is network value high versus transfer value?
- **Competitor parity:** lib.nvt, coc.nvt
- **Metrics:** nvt_daily, nvt_sma30_daily
- **Default metric:** nvt_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** NVT [nvt_daily] on left as line; NVT SMA30 [nvt_sma30_daily] on left as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Is network value high versus transfer value?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on flow.nvt preserves range, grain and annotations.

---

## flow.transfer_volume — Transfer Volume & Velocity

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** How much value is moving onchain?
- **Competitor parity:** coc.transfer_volumes, lib.transfer_volume
- **Metrics:** transfer_volume_daily, transfer_volume_hourly, transfer_volume_weekly, transfer_volume_sma7_daily, transfer_volume_sma30_daily, transfer_volume_cumulative_daily, transfer_count_daily, transfer_count_hourly, transfer_usd_daily
- **Default metric:** transfer_volume_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: BTC (linear); right: USD (log)
- **Variants:** btc (BTC: transfer_volume_daily); usd (USD: transfer_usd_daily); count (Count: transfer_count_daily); cumulative (Cumulative: transfer_volume_cumulative_daily)
- **Default series:** Transfer volume BTC [transfer_volume_daily] on left as bar; Transfer volume USD [transfer_usd_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How much value is moving onchain?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on flow.transfer_volume preserves range, grain and annotations.
- [ ] USD volume equals BTC volume multiplied by the daily close.
- [ ] Cumulative series is monotonic except across reorg corrections.

---

## flow.value_bands — Value Bands in BTC

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** What BTC value sits in each transfer band?
- **Competitor parity:** coc.transfer_volumes
- **Metrics:** value_dust_btc_daily, value_small_btc_daily, value_retail_btc_daily, value_institutional_btc_daily, value_whale_btc_daily
- **Default metric:** value_dust_btc_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** btc (BTC: value_dust_btc_daily); share (Share: value_whale_btc_daily)
- **Default series:** Dust [value_dust_btc_daily] on left as area; Small [value_small_btc_daily] on left as area; Retail [value_retail_btc_daily] on left as area; Institutional [value_institutional_btc_daily] on left as area; Whale [value_whale_btc_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- What BTC value sits in each transfer band?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on flow.value_bands preserves range, grain and annotations.

---

## flow.vddm — Value Days Destroyed Multiple

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** Is spent value high versus HODL value?
- **Competitor parity:** lib.vddm, coc.vddm
- **Metrics:** vddm_daily, spent_value_daily
- **Default metric:** vddm_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: multiple (linear); right: BTC (log)
- **Variants:** grain only
- **Default series:** VDDM [vddm_daily] on left as line; Spent value [spent_value_daily] on right as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is spent value high versus HODL value?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on flow.vddm preserves range, grain and annotations.

---

## flow.velocity — Monetary Velocity

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_9_flow
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** How fast is supply circulating?
- **Competitor parity:** coc.velocity
- **Metrics:** velocity_daily
- **Default metric:** velocity_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** Velocity [velocity_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- How fast is supply circulating?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on flow.velocity preserves range, grain and annotations.

---

## mining.hashprice — Hashprice

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_10_mining
- **Priority:** P1
- **Archetype:** line_oscillator
- **Question:** What does hash earn per unit?
- **Competitor parity:** coc.hashprice, lib.hashprice
- **Metrics:** hashprice_daily
- **Default metric:** hashprice_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: USD/TH (linear)
- **Variants:** grain only
- **Default series:** Hashprice [hashprice_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- What does hash earn per unit?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on mining.hashprice preserves range, grain and annotations.

---

## mining.hashrate — Hashrate & Difficulty

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_10_mining
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** Is mining power growing?
- **Competitor parity:** lib.hashrate, coc.difficulty
- **Metrics:** hashrate_daily, hashrate_weekly, hashrate_sma30_daily, difficulty_daily, difficulty_weekly, difficulty_sma14_daily
- **Default metric:** hashrate_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: H/s (linear); right: difficulty (log)
- **Variants:** hashrate (Hashrate: hashrate_daily); difficulty (Difficulty: difficulty_daily)
- **Default series:** Hashrate [hashrate_daily] on left as line; Difficulty [difficulty_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Is mining power growing?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on mining.hashrate preserves range, grain and annotations.
- [ ] Hashrate derives from difficulty and block interval; formula is documented.
- [ ] Difficulty and hashrate use separate axes.

---

## mining.hashribbon — Hash Ribbons

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_10_mining
- **Priority:** P1
- **Archetype:** bands_overlay
- **Question:** Are miners capitulating?
- **Competitor parity:** lib.hash_ribbons, coc.hashribbons
- **Metrics:** hashribbon_fast_daily, hashribbon_slow_daily, hashribbon_cross_daily
- **Default metric:** hashribbon_fast_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: H/s (linear)
- **Variants:** grain only
- **Default series:** Fast MA [hashribbon_fast_daily] on left as line; Slow MA [hashribbon_slow_daily] on left as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Are miners capitulating?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on mining.hashribbon preserves range, grain and annotations.
- [ ] Fast and slow ribbon MAs use the documented windows.
- [ ] Cross marker appears on the crossing date, not the next bar.

---

## mining.revenue — Miner Revenue

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_10_mining
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** How much do miners earn from subsidy and fees?
- **Competitor parity:** lib.miner_revenue, coc.mining_revenue
- **Metrics:** miner_revenue_btc_daily, miner_revenue_sma7_daily, miner_revenue_usd_daily, reward_daily, reward_weekly, reward_cumulative_daily, fee_share_pct_daily, fees_vs_reward_daily
- **Default metric:** miner_revenue_btc_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: BTC (linear); right: USD (log)
- **Variants:** btc (BTC: miner_revenue_btc_daily); usd (USD: miner_revenue_usd_daily); fees (Fees vs Subsidy: fee_share_pct_daily, fees_vs_reward_daily)
- **Default series:** Revenue BTC [miner_revenue_btc_daily] on left as bar; Revenue USD [miner_revenue_usd_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How much do miners earn from subsidy and fees?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on mining.revenue preserves range, grain and annotations.
- [ ] Subsidy + fees equals miner revenue in BTC.
- [ ] Fee share equals fees / revenue.

---

## network.blocks — Blocks & Block Interval

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_11_network
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** Is the chain producing blocks on schedule?
- **Competitor parity:** lib.blocks, coc.block_interval
- **Metrics:** blocks_daily, blocks_hourly, blocks_weekly, blocks_sma7_daily, blocks_cumulative_daily, avg_block_interval_daily, avg_block_interval_weekly, height_daily, block_stats_daily
- **Legacy aliases:** block_stats_daily
- **Default metric:** blocks_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: blocks (linear)
- **Variants:** blocks (Blocks: blocks_daily); interval (Interval: avg_block_interval_daily); height (Height: height_daily)
- **Default series:** Blocks [blocks_daily] on left as bar; SMA7 [blocks_sma7_daily] on left as line
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- Is the chain producing blocks on schedule?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on network.blocks preserves range, grain and annotations.
- [ ] Blocks per day is around 144; outliers are real, not clamped.
- [ ] Block interval target line is 600 seconds.

---

## network.blocksize — Block Size & Weight

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_11_network
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** How full are blocks?
- **Competitor parity:** lib.block_size, coc.block_size
- **Metrics:** avg_block_size_daily, avg_block_size_weekly, avg_block_size_sma7_daily, avg_block_weight_daily, avg_block_weight_weekly, avg_block_weight_sma7_daily, block_size_total_daily, block_size_total_weekly
- **Default metric:** avg_block_size_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: bytes (linear); right: WU (log)
- **Variants:** size (Size: avg_block_size_daily); weight (Weight: avg_block_weight_daily); total (Total: block_size_total_daily)
- **Default series:** Avg size [avg_block_size_daily] on left as line; Avg weight [avg_block_weight_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How full are blocks?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on network.blocksize preserves range, grain and annotations.

---

## network.lightning — Lightning Network

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_11_network
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** Is Lightning capacity and node count growing?
- **Competitor parity:** lib.lightning, coc.lightning
- **Metrics:** lightning_capacity_daily, lightning_nodes_daily
- **Default metric:** lightning_capacity_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: BTC (linear); right: nodes (log)
- **Variants:** grain only
- **Default series:** Capacity BTC [lightning_capacity_daily] on left as line; Nodes [lightning_nodes_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Is Lightning capacity and node count growing?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on network.lightning preserves range, grain and annotations.

---

## network.tx_per_block — Transactions per Block

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_11_network
- **Priority:** P1
- **Archetype:** multi_series
- **Question:** Is block demand rising?
- **Competitor parity:** coc.txs_per_block
- **Metrics:** avg_txs_per_block_daily, avg_txs_per_block_weekly, avg_txs_per_block_sma7_daily
- **Default metric:** avg_txs_per_block_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: tx (linear)
- **Variants:** grain only
- **Default series:** Tx/block [avg_txs_per_block_daily] on left as line; SMA7 [avg_txs_per_block_sma7_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Is block demand rising?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on network.tx_per_block preserves range, grain and annotations.

---

## script.counts — Script Type Counts

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_12_script
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** Which output script types are used?
- **Competitor parity:** coc.script_types, lib.script_types
- **Metrics:** script_p2pkh_daily, script_p2sh_daily, script_p2wpkh_daily, script_p2wsh_daily, script_p2tr_daily, script_pubkey_daily, script_multisig_daily, script_nulldata_daily, script_nonstandard_daily
- **Default metric:** script_p2pkh_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: outputs (linear)
- **Variants:** count (Count: script_p2pkh_daily)
- **Default series:** P2PKH [script_p2pkh_daily] on left as area; P2SH [script_p2sh_daily] on left as area; P2WPKH [script_p2wpkh_daily] on left as area; P2WSH [script_p2wsh_daily] on left as area; P2TR [script_p2tr_daily] on left as area; P2PK [script_pubkey_daily] on left as area; Multisig [script_multisig_daily] on left as area; Null data [script_nulldata_daily] on left as area; Nonstandard [script_nonstandard_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- Which output script types are used?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on script.counts preserves range, grain and annotations.
- [ ] Script counts sum to total outputs within documented tolerance.
- [ ] Unknown script types are grouped as nonstandard.

---

## script.shares — Script Type Shares

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_12_script
- **Priority:** P1
- **Archetype:** stacked_area
- **Question:** How is usage split by script type?
- **Competitor parity:** coc.script_types
- **Metrics:** script_p2pkh_share_daily, script_p2sh_share_daily, script_p2wpkh_share_daily, script_p2wsh_share_daily, script_p2tr_share_daily, script_pubkey_share_daily, script_multisig_share_daily, script_nulldata_share_daily, script_nonstandard_share_daily
- **Default metric:** script_p2pkh_share_daily
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** share (Share: script_p2pkh_share_daily)
- **Default series:** P2PKH [script_p2pkh_share_daily] on left as area; P2SH [script_p2sh_share_daily] on left as area; P2WPKH [script_p2wpkh_share_daily] on left as area; P2WSH [script_p2wsh_share_daily] on left as area; P2TR [script_p2tr_share_daily] on left as area; P2PK [script_pubkey_share_daily] on left as area; Multisig [script_multisig_share_daily] on left as area; Null data [script_nulldata_share_daily] on left as area; Nonstandard [script_nonstandard_share_daily] on left as area
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show composition and how shares shift over time.
- How is usage split by script type?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on script.shares preserves range, grain and annotations.

---

## macro.dashboard — Macro Dashboard

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_13_macro
- **Priority:** P1
- **Archetype:** dashboard_grid
- **Question:** Is liquidity risk-on or risk-off?
- **Competitor parity:** itc.macro, lib.macro, coc.capital_rotation
- **Metrics:** dxy_daily, cpi_yoy_daily, fed_funds_daily, m2_global_daily
- **Default metric:** m2_global_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** liquidity (Liquidity: m2_global_daily, fed_funds_daily); inflation (Inflation: cpi_yoy_daily); dollar (Dollar: dxy_daily)
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Answer a multi-metric question in one screen.
- Is liquidity risk-on or risk-off?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on macro.dashboard preserves range, grain and annotations.
- [ ] All cards share the selected range.
- [ ] Each card shows its own unit and source freshness.

---

## macro.relative — BTC Dominance / ETH-BTC / Total Cap

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_13_macro
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** Is capital rotating into or out of BTC?
- **Competitor parity:** itc.dominance, itc.flippening, lib.macro
- **Metrics:** btc_dominance_daily, ethbtc_daily, total_mcap_daily
- **Default metric:** btc_dominance_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: pct (linear); right: ratio (log)
- **Variants:** dominance (Dominance: btc_dominance_daily); ethbtc (ETH/BTC: ethbtc_daily); total (Total Cap: total_mcap_daily)
- **Default series:** BTC dominance % [btc_dominance_daily] on left as line; ETH/BTC [ethbtc_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- Is capital rotating into or out of BTC?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on macro.relative preserves range, grain and annotations.

---

## derivatives.funding — Funding Rates

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_14_derivatives
- **Priority:** P1
- **Archetype:** bar_series
- **Question:** Are longs paying shorts?
- **Competitor parity:** lib.funding, coc.funding
- **Metrics:** funding_rate_daily
- **Default metric:** funding_rate_daily
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: rate (linear)
- **Variants:** rate (Funding: funding_rate_daily)
- **Default series:** Funding rate [funding_rate_daily] on left as bar
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Show discrete period values and outliers clearly.
- Are longs paying shorts?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on derivatives.funding preserves range, grain and annotations.
- [ ] Zero line is visible; positive/negative bars are colour-coded.
- [ ] Annualised toggle uses 365 days and is labelled.

---

## derivatives.open_interest — Open Interest

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_14_derivatives
- **Priority:** P1
- **Archetype:** line_dual_axis
- **Question:** How leveraged is the futures market?
- **Competitor parity:** lib.open_interest, coc.open_interest
- **Metrics:** open_interest_daily
- **Default metric:** open_interest_daily
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: USD (linear); right: USD (log)
- **Variants:** oi (Open Interest: open_interest_daily)
- **Default series:** Open interest [open_interest_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How leveraged is the futures market?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on derivatives.open_interest preserves range, grain and annotations.

---

## sentiment.fear_greed — Fear & Greed

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_15_sentiment
- **Priority:** P1
- **Archetype:** gauge_composite
- **Question:** Is sentiment fearful or greedy?
- **Competitor parity:** lib.fear_greed, coc.fear_greed
- **Metrics:** fear_greed_daily
- **Default metric:** fear_greed_daily
- **Chart types:** gauge, line
- **Panes:** gauge, history
- **Axes:** gauge: 0-100 (linear)
- **Variants:** gauge (Gauge: fear_greed_daily); history (History: fear_greed_daily)
- **Default series:** Fear & Greed [fear_greed_daily] on gauge as gauge
- **Controls:** components, fullscreen, grain, history_toggle, range, screenshot, thresholds
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Give one number for the current regime plus the evidence behind it.
- Is sentiment fearful or greedy?

**Acceptance:**
- [ ] Gauge bands and labels match the metric definition.
- [ ] Component contributions are visible and sum correctly.
- [ ] History toggle shows the same value over time.
- [ ] Switching every variant on sentiment.fear_greed preserves range, grain and annotations.
- [ ] Gauge bands match the published 0-100 scale.
- [ ] History uses the same scale and source.

---

## alerts.manager — Chart Alerts

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** Can users be notified when a level breaks?
- **Competitor parity:** itc.alerts, lib.alerts, coc.alerts
- **Metrics:** new derived series only
- **New metrics required:** alert_rules, alert_events
- **Default metric:** n/a
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: alert_rules, alert_events

**Expected:**
- Answer a multi-metric question in one screen.
- Can users be notified when a level breaks?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on alerts.manager preserves range, grain and annotations.
- [ ] Rules fire once per bucket and respect cooldown.
- [ ] Paused rules never deliver.

---

## compare.overlay — Compare Overlay

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** How do selected metrics move together?
- **Competitor parity:** itc.compare, lib.compare, coc.compare
- **Metrics:** price_close_daily
- **New metrics required:** normalized_series
- **Default metric:** price_close_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: USD (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: normalized_series

**Expected:**
- Compare related series in one frame with explicit units and axes.
- How do selected metrics move together?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on compare.overlay preserves range, grain and annotations.
- [ ] Normalised overlay starts every series at 100.
- [ ] Correlation matrix is symmetric with 1.0 on the diagonal.

---

## strategies.dca — DCA Lab

- **Status:** existing
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P0
- **Archetype:** dashboard_grid
- **Question:** What if I DCA versus lump sum?
- **Competitor parity:** itc.dca, lib.portfolio
- **Metrics:** price_close_daily
- **Default metric:** price_close_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Answer a multi-metric question in one screen.
- What if I DCA versus lump sum?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on strategies.dca preserves range, grain and annotations.
- [ ] DCA uses the selected frequency and daily close.
- [ ] Fees and slippage assumptions are displayed.

---

## strategies.exit — Exit Strategy Simulator

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** When would rule-based exits have sold?
- **Competitor parity:** itc.exit, lib.strategies
- **Metrics:** price_close_daily
- **New metrics required:** exit_signals
- **Default metric:** price_close_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: exit_signals

**Expected:**
- Answer a multi-metric question in one screen.
- When would rule-based exits have sold?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on strategies.exit preserves range, grain and annotations.
- [ ] No lookahead: signals use data available at the close.
- [ ] Fees and slippage are displayed.

---

## strategies.portfolio — Risk Portfolio Tester

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** How would a portfolio have behaved?
- **Competitor parity:** itc.portfolio, itc.mpt, lib.portfolio
- **Metrics:** price_close_daily
- **New metrics required:** portfolio_weights, portfolio_metrics
- **Default metric:** price_close_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: portfolio_weights, portfolio_metrics

**Expected:**
- Answer a multi-metric question in one screen.
- How would a portfolio have behaved?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on strategies.portfolio preserves range, grain and annotations.
- [ ] Weights sum to 100%.
- [ ] Rebalance frequency and fees are displayed.

---

## workbench.custom — Indicator Workbench

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_15_platform
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Can users compose custom indicators without code?
- **Competitor parity:** itc.workbench
- **Metrics:** price_close_daily
- **New metrics required:** formula_engine
- **Default metric:** price_close_daily
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: USD (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on left as line
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: formula_engine

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Can users compose custom indicators without code?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on workbench.custom preserves range, grain and annotations.
- [ ] Formula parser rejects unknown identifiers and SQL.
- [ ] Depth limit is 20 and errors are shown inline.

---

## cointime.liveliness — Liveliness & Vaultedness

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** line_oscillator
- **Question:** Is old supply waking up or vaulting?
- **Competitor parity:** coc.liveliness
- **Metrics:** new derived series only
- **New metrics required:** liveliness, vaultedness, liveliness_derivative_30d
- **Default metric:** n/a
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: liveliness, vaultedness, liveliness_derivative_30d

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is old supply waking up or vaulting?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on cointime.liveliness preserves range, grain and annotations.
- [ ] Liveliness and vaultedness stay in 0-1.
- [ ] Derivative window is labelled.

---

## cointime.supply_regions — Active vs Vaulted Supply

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** stacked_area
- **Question:** How much supply is active versus vaulted?
- **Competitor parity:** coc.supply_regions
- **Metrics:** new derived series only
- **New metrics required:** active_supply, vaulted_supply
- **Default metric:** n/a
- **Chart types:** stacked_area, line
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, legend, percent_mode, range, reorder, reset_zoom, saved_layout, screenshot, series_toggle, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: active_supply, vaulted_supply

**Expected:**
- Show composition and how shares shift over time.
- How much supply is active versus vaulted?

**Acceptance:**
- [ ] Share mode sums to 100% within rounding tolerance.
- [ ] Stack order is stable and user-reorderable.
- [ ] Hidden series are excluded from the percent denominator.
- [ ] Switching every variant on cointime.supply_regions preserves range, grain and annotations.

---

## cycle.master — Cycle Master Dashboard

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** How do cycle extremes line up across models?
- **Competitor parity:** itc.cycle_master, lib.cycle_master
- **Metrics:** risk_daily, mvrv_z_daily, ma200w_daily, pi_oscillator_daily
- **Default metric:** risk_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grid (Dashboard: risk_daily, mvrv_z_daily, ma200w_daily, pi_oscillator_daily)
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Answer a multi-metric question in one screen.
- How do cycle extremes line up across models?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on cycle.master preserves range, grain and annotations.

---

## derivatives.liquidations — Liquidations

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** bar_series
- **Question:** Where did leverage get flushed?
- **Competitor parity:** coc.liquidations
- **Metrics:** new derived series only
- **New metrics required:** long_liquidations_usd, short_liquidations_usd
- **Default metric:** n/a
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: long_liquidations_usd, short_liquidations_usd

**Expected:**
- Show discrete period values and outliers clearly.
- Where did leverage get flushed?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on derivatives.liquidations preserves range, grain and annotations.

---

## derivatives.options — Options OI / IV / Skew

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** What are options markets pricing?
- **Competitor parity:** coc.options, coc.ibit_options
- **Metrics:** new derived series only
- **New metrics required:** options_oi, options_volume, atm_iv, put_call_ratio, delta_skew
- **Default metric:** n/a
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: options_oi, options_volume, atm_iv, put_call_ratio, delta_skew

**Expected:**
- Compare related series in one frame with explicit units and axes.
- What are options markets pricing?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on derivatives.options preserves range, grain and annotations.

---

## derivatives.term_structure — Futures Term Structure

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Is the futures curve in contango or backwardation?
- **Competitor parity:** coc.term_structure
- **Metrics:** new derived series only
- **New metrics required:** futures_term_structure
- **Default metric:** n/a
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: futures_term_structure

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Is the futures curve in contango or backwardation?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on derivatives.term_structure preserves range, grain and annotations.

---

## etf.balances — ETF Balances & AUM

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** line_dual_axis
- **Question:** How much BTC do ETFs hold?
- **Competitor parity:** coc.etf_balances, lib.etf
- **Metrics:** new derived series only
- **New metrics required:** etf_holdings_btc, etf_aum_usd, etf_volume_usd
- **Default metric:** n/a
- **Chart types:** line, area
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** axis_toggle, crosshair, csv, custom_range, dual_axis_labels, fullscreen, grain, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: etf_holdings_btc, etf_aum_usd, etf_volume_usd

**Expected:**
- Compare a metric with BTC price without losing either scale.
- How much BTC do ETFs hold?

**Acceptance:**
- [ ] Both Y axes are visible and colour-matched to their series.
- [ ] Toggling price hides the right axis and reflows the left axis.
- [ ] Axis assignment is preserved across range and variant changes.
- [ ] Switching every variant on etf.balances preserves range, grain and annotations.
- [ ] Holdings and AUM use the same issuer set and date.
- [ ] Freshness badge shows the issuer data date.

---

## macro.correlations — Cross-Asset Correlations

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** scatter
- **Question:** How does BTC correlate with macro assets?
- **Competitor parity:** coc.correlations
- **Metrics:** price_close_daily, dxy_daily, m2_global_daily
- **New metrics required:** rolling_correlation_btc_dxy, rolling_correlation_btc_m2
- **Default metric:** price_close_daily
- **Chart types:** scatter, regression
- **Panes:** scatter
- **Axes:** x: USD (linear); y: index (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** csv, hover_detail, log_x, log_y, quadrants, range, regression, screenshot, x_metric, y_metric
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: rolling_correlation_btc_dxy, rolling_correlation_btc_m2

**Expected:**
- Show relationship, clusters and outliers between two metrics.
- How does BTC correlate with macro assets?

**Acceptance:**
- [ ] Axis labels name both metrics and units.
- [ ] Regression line and R² are shown only when computed.
- [ ] Hover identifies the date behind each point.
- [ ] Switching every variant on macro.correlations preserves range, grain and annotations.

---

## profitability.realized_pnl — Net Realized PnL

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** bar_series
- **Question:** How much profit or loss is being realized?
- **Competitor parity:** coc.net_realised_pnl, lib.realized_pnl
- **Metrics:** new derived series only
- **New metrics required:** net_realized_pnl_usd, net_realized_pnl_btc, realized_profit_usd, realized_loss_usd
- **Default metric:** n/a
- **Chart types:** columns, stacked_columns, line
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** bar_mode, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, range, reset_zoom, saved_layout, screenshot, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: net_realized_pnl_usd, net_realized_pnl_btc, realized_profit_usd, realized_loss_usd

**Expected:**
- Show discrete period values and outliers clearly.
- How much profit or loss is being realized?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on profitability.realized_pnl preserves range, grain and annotations.
- [ ] Net realized PnL = realized profit minus realized loss.
- [ ] USD series equals BTC series multiplied by the daily close.

---

## profitability.sell_side_risk — Sell-Side Risk Ratio

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** line_oscillator
- **Question:** How much sell pressure per unit of realized cap?
- **Competitor parity:** coc.sell_side_risk
- **Metrics:** new derived series only
- **New metrics required:** sell_side_risk, sell_side_risk_sth, sell_side_risk_lth
- **Default metric:** n/a
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: sell_side_risk, sell_side_risk_sth, sell_side_risk_lth

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- How much sell pressure per unit of realized cap?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on profitability.sell_side_risk preserves range, grain and annotations.
- [ ] Formula and denominator are documented in the chart description.
- [ ] Division by zero is rendered as a gap, not infinity.

---

## profitability.sopr_cohorts — SOPR by Cohort

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Are STH or LTH selling at profit or loss?
- **Competitor parity:** coc.sth_sopr, coc.lth_sopr
- **Metrics:** new derived series only
- **New metrics required:** sth_sopr, lth_sopr, sth_sopr_z, lth_sopr_z
- **Default metric:** n/a
- **Chart types:** line, step, area
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** axis_assign, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, normalize, price_overlay, range, reset_zoom, saved_layout, screenshot, series_toggle, smoothing, zoom
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: sth_sopr, lth_sopr, sth_sopr_z, lth_sopr_z

**Expected:**
- Compare related series in one frame with explicit units and axes.
- Are STH or LTH selling at profit or loss?

**Acceptance:**
- [ ] Normalisation modes (raw, %, index=100, z-score) are labelled and reversible.
- [ ] Each series can be hidden without changing the others.
- [ ] Series with incompatible units default to separate axes or are rejected.
- [ ] Switching every variant on profitability.sopr_cohorts preserves range, grain and annotations.
- [ ] Weighted cohort SOPR equals market SOPR within 0.1%.
- [ ] Cohort boundary is 155 days and labelled.

---

## risk.dashboard — Risk Regime Dashboard

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** Which risk components are flashing?
- **Competitor parity:** itc.risk_dashboard
- **Metrics:** risk_daily, risk_mvrv_daily, risk_nupl_daily, risk_sopr_daily, risk_puell_daily, risk_mayer_daily
- **Default metric:** risk_daily
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** card_select, fullscreen, grain, layout, range, screenshot, sync_range
- **Annotations:** crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Answer a multi-metric question in one screen.
- Which risk components are flashing?

**Acceptance:**
- [ ] All cards share the selected range and grain.
- [ ] Card order persists per user.
- [ ] Empty or stale cards show an explicit badge, never a blank panel.
- [ ] Switching every variant on risk.dashboard preserves range, grain and annotations.

---

## supply.profit_loss — Supply in Profit / Loss

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** bands_overlay
- **Question:** What share of supply is in profit or loss?
- **Competitor parity:** coc.supply_in_profit, lib.supply_in_profit
- **Metrics:** new derived series only
- **New metrics required:** pct_supply_in_profit, pct_supply_in_loss, pct_supply_in_profit_sth, pct_supply_in_profit_lth
- **Default metric:** n/a
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: value (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: pct_supply_in_profit, pct_supply_in_loss, pct_supply_in_profit_sth, pct_supply_in_profit_lth

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- What share of supply is in profit or loss?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on supply.profit_loss preserves range, grain and annotations.
- [ ] Profit and loss shares sum to 100% within rounding.
- [ ] Cohort split sums to the market share.

---

## technical.bollinger — Bollinger Bands

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** bands_overlay
- **Question:** Is price stretched versus its 20D band?
- **Competitor parity:** coc.bollinger
- **Metrics:** price_close_daily
- **New metrics required:** bollinger_upper, bollinger_middle, bollinger_lower
- **Default metric:** price_close_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: USD (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on left as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: bollinger_upper, bollinger_middle, bollinger_lower

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Is price stretched versus its 20D band?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on technical.bollinger preserves range, grain and annotations.
- [ ] Bands use 20D SMA and 2 standard deviations by default.
- [ ] Band fill breaks on null.

---

## technical.drawdown_table — Drawdown Table

- **Status:** new
- **Implementation:** in_progress
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** table
- **Question:** How do current and past drawdowns compare?
- **Competitor parity:** coc.drawdowns, lib.drawdowns
- **Metrics:** drawdown_daily
- **New metrics required:** drawdown_episodes
- **Default metric:** drawdown_daily
- **Chart types:** table
- **Panes:** table
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** export_csv, period, range, screenshot, sort
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: drawdown_episodes

**Expected:**
- Answer period-by-period comparison questions without chart distortion.
- How do current and past drawdowns compare?

**Acceptance:**
- [ ] Sorting is numeric where appropriate.
- [ ] Colour scales remain readable in light and dark themes.
- [ ] CSV export matches the visible table.
- [ ] Switching every variant on technical.drawdown_table preserves range, grain and annotations.

---

## technical.macd — MACD

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** multi_pane
- **Question:** Is momentum accelerating or fading?
- **Competitor parity:** coc.macd
- **Metrics:** price_close_daily
- **New metrics required:** macd_line, macd_signal, macd_histogram
- **Default metric:** price_close_daily
- **Chart types:** line, columns
- **Panes:** price, indicator
- **Axes:** left: USD (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on left as line
- **Controls:** crosshair, csv, fullscreen, grain, indicator_params, legend, log_axis, range, reset_zoom, screenshot, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: macd_line, macd_signal, macd_histogram

**Expected:**
- Show price and a derived indicator in linked panes.
- Is momentum accelerating or fading?

**Acceptance:**
- [ ] Panes share the time axis and crosshair.
- [ ] Indicator parameters are explicit and persisted.
- [ ] Pane heights are resizable and remembered.
- [ ] Switching every variant on technical.macd preserves range, grain and annotations.
- [ ] MACD uses 12/26/9 by default and labels parameters.
- [ ] Histogram is MACD minus signal.

---

## technical.monthly_returns — Monthly Returns Heatmap

- **Status:** new
- **Implementation:** in_progress
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** heatmap
- **Question:** Which months were strong or weak?
- **Competitor parity:** lib.monthly_returns, coc.monthly_performance
- **Metrics:** price_close_daily
- **New metrics required:** monthly_return_matrix
- **Default metric:** price_close_daily
- **Chart types:** heatmap
- **Panes:** heatmap
- **Axes:** x: month (linear); y: year (linear); color: pct (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on y as line
- **Controls:** bin_size, color_scale, csv, fullscreen, hover_detail, log_color, range, reset_zoom, saved_layout, screenshot, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: monthly_return_matrix

**Expected:**
- Reveal how a two-dimensional distribution changes over time.
- Which months were strong or weak?

**Acceptance:**
- [ ] Colour scale legend shows units and min/max.
- [ ] Empty bins render as background, not zero-colour.
- [ ] Hover reports date, bin range and value.
- [ ] Switching every variant on technical.monthly_returns preserves range, grain and annotations.
- [ ] Monthly returns are calendar-month close-to-close.
- [ ] Heatmap colour scale is symmetric around zero.

---

## technical.seasonality — Seasonality

- **Status:** new
- **Implementation:** in_progress
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** table
- **Question:** How does this month/quarter usually perform?
- **Competitor parity:** lib.seasonality, coc.monthly_performance
- **Metrics:** price_close_daily
- **New metrics required:** seasonality_matrix
- **Default metric:** price_close_daily
- **Chart types:** table
- **Panes:** table
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** export_csv, period, range, screenshot, sort
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: seasonality_matrix

**Expected:**
- Answer period-by-period comparison questions without chart distortion.
- How does this month/quarter usually perform?

**Acceptance:**
- [ ] Sorting is numeric where appropriate.
- [ ] Colour scales remain readable in light and dark themes.
- [ ] CSV export matches the visible table.
- [ ] Switching every variant on technical.seasonality preserves range, grain and annotations.
- [ ] Matrix cells use the same return definition.
- [ ] Average and median are distinguished.

---

## technical.stochastic — Stochastic Oscillator

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** line_oscillator
- **Question:** Is price at an extreme in its recent range?
- **Competitor parity:** coc.stochastic
- **Metrics:** price_close_daily
- **New metrics required:** stoch_k, stoch_d
- **Default metric:** price_close_daily
- **Chart types:** line, step, area, histogram
- **Panes:** metric
- **Axes:** left: USD (linear)
- **Variants:** grain only
- **Default series:** BTC close / day [price_close_daily] on left as line
- **Controls:** crosshair, csv, custom_range, fullscreen, grain, histogram_variant, legend, log_axis, price_overlay, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: stoch_k, stoch_d

**Expected:**
- Show whether the metric is high, low, rising or falling versus its own history.
- Is price at an extreme in its recent range?

**Acceptance:**
- [ ] ZERO and null values are not silently coerced; gaps render as gaps.
- [ ] Threshold lines are labelled with exact values.
- [ ] Histogram variant bins the selected window and labels bin width.
- [ ] Switching every variant on technical.stochastic preserves range, grain and annotations.
- [ ] %K and %D use the documented periods and stay 0-100.
- [ ] Overbought/oversold thresholds are labelled.

---

## treasury.companies — Treasury Companies

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** table
- **Question:** Which public companies hold BTC and at what cost?
- **Competitor parity:** coc.treasuries, lib.treasury
- **Metrics:** new derived series only
- **New metrics required:** treasury_holdings_btc, treasury_cost_basis, treasury_mnav
- **Default metric:** n/a
- **Chart types:** table
- **Panes:** table
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** export_csv, period, range, screenshot, sort
- **Annotations:** crosshair, last_value
- **Data freshness:** n/a
- **Data requirements:** New derived series or external ingest required: treasury_holdings_btc, treasury_cost_basis, treasury_mnav

**Expected:**
- Answer period-by-period comparison questions without chart distortion.
- Which public companies hold BTC and at what cost?

**Acceptance:**
- [ ] Sorting is numeric where appropriate.
- [ ] Colour scales remain readable in light and dark themes.
- [ ] CSV export matches the visible table.
- [ ] Switching every variant on treasury.companies preserves range, grain and annotations.
- [ ] Cost basis equals holdings-weighted acquisition price.
- [ ] mNAV uses market cap / BTC NAV and is labelled.

---

## urpd.diffs — URPD Differences

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** price_distribution
- **Question:** Which price levels gained or lost supply?
- **Competitor parity:** coc.urpd_diff
- **Metrics:** new derived series only
- **New metrics required:** urpd_diff_7d, urpd_diff_30d, urpd_diff_90d
- **Default metric:** n/a
- **Chart types:** columns
- **Panes:** distribution
- **Axes:** x: USD (log); y: BTC (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, bin_size, log_x, log_y, percent_mode, series_toggle, hover_detail, zoom, reset_zoom, fullscreen, screenshot, csv, saved_layout
- **Annotations:** crosshair
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: urpd_diff_7d, urpd_diff_30d, urpd_diff_90d

**Expected:**
- Show discrete period values and outliers clearly.
- Which price levels gained or lost supply?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on urpd.diffs preserves range, grain and annotations.

---

## urpd.distribution — URPD: Supply by Cost Basis

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** price_distribution
- **Question:** Where is supply clustered by onchain cost basis?
- **Competitor parity:** coc.urpd, lib.urpd
- **Metrics:** new derived series only
- **New metrics required:** urpd_bins
- **Default metric:** n/a
- **Chart types:** columns
- **Panes:** distribution
- **Axes:** x: USD (log); y: BTC (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, bin_size, log_x, log_y, percent_mode, series_toggle, hover_detail, zoom, reset_zoom, fullscreen, screenshot, csv, saved_layout
- **Annotations:** crosshair
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: urpd_bins

**Expected:**
- Show discrete period values and outliers clearly.
- Where is supply clustered by onchain cost basis?

**Acceptance:**
- [ ] Grouped and stacked modes are labelled.
- [ ] Negative values render below zero.
- [ ] Bar width adapts to grain and stays legible at 1D and All ranges.
- [ ] Switching every variant on urpd.distribution preserves range, grain and annotations.
- [ ] Bins sum to circulating supply within rounding.
- [ ] Price buckets and log scale are labelled.

---

## urpd.heatmap — URPD Heatmap

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** heatmap
- **Question:** How has the cost-basis distribution shifted over time?
- **Competitor parity:** coc.urpd_heatmap
- **Metrics:** new derived series only
- **New metrics required:** urpd_heatmap
- **Default metric:** n/a
- **Chart types:** heatmap
- **Panes:** heatmap
- **Axes:** x: USD (log); y: date (linear); color: BTC (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** bin_size, color_scale, csv, fullscreen, hover_detail, log_color, range, reset_zoom, saved_layout, screenshot, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: urpd_heatmap

**Expected:**
- Reveal how a two-dimensional distribution changes over time.
- How has the cost-basis distribution shifted over time?

**Acceptance:**
- [ ] Colour scale legend shows units and min/max.
- [ ] Empty bins render as background, not zero-colour.
- [ ] Hover reports date, bin range and value.
- [ ] Switching every variant on urpd.heatmap preserves range, grain and annotations.
- [ ] Empty bins render as background, not zero.
- [ ] Colour legend shows supply units and min/max.

---

## valuation.histograms — MVRV / NUPL / SOPR Histograms

- **Status:** new
- **Implementation:** in_progress
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** distribution_histogram
- **Question:** How does today compare with historical distributions?
- **Competitor parity:** coc.histogram_mvrv, coc.histogram_nupl, coc.histogram_sopr, lib.mvrv_histogram
- **Metrics:** mvrv_daily, nupl_daily, sopr_daily
- **Default metric:** mvrv_daily
- **Chart types:** histogram
- **Panes:** distribution
- **Axes:** x: ratio (linear); y: count (linear)
- **Variants:** mvrv (MVRV: mvrv_daily); nupl (NUPL: nupl_daily); sopr (SOPR: sopr_daily)
- **Default series:** composite/dashboard (see expected)
- **Controls:** bins, csv, log_y, percentile_markers, range, screenshot, window
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily

**Expected:**
- Place the current value inside its historical distribution.
- How does today compare with historical distributions?

**Acceptance:**
- [ ] Bin count and window are displayed.
- [ ] Current-value marker matches the latest API point.
- [ ] Changing window or bins recomputes without refetching unrelated metrics.
- [ ] Switching every variant on valuation.histograms preserves range, grain and annotations.

---

## valuation.quantile_bands — MVRV Quantile Bands

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_16_data_dependent
- **Priority:** P2
- **Archetype:** bands_overlay
- **Question:** Which historical valuation quantile is price in?
- **Competitor parity:** lib.mvrv_quantiles, coc.quantiles
- **Metrics:** mvrv_daily
- **New metrics required:** mvrv_quantile_bands
- **Default metric:** mvrv_daily
- **Chart types:** line, area, band
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** MVRV / day [mvrv_daily] on left as line; BTC price [price_close_daily] on right as line
- **Controls:** band_toggle, crosshair, csv, custom_range, fullscreen, grain, legend, log_axis, price_overlay, quantile_window, range, reset_zoom, saved_layout, screenshot, smoothing, thresholds, zoom
- **Annotations:** halvings, crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: mvrv_quantile_bands

**Expected:**
- Show price or a metric relative to model bands and historical quantiles.
- Which historical valuation quantile is price in?

**Acceptance:**
- [ ] Band fill is bounded by the correct upper/lower series at every point.
- [ ] Band toggle changes only visibility, never the underlying scale.
- [ ] Missing band points break the fill rather than closing to zero.
- [ ] Switching every variant on valuation.quantile_bands preserves range, grain and annotations.

---

## cycle.rainbow — Rainbow Chart

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** bands_overlay
- **Question:** Where is price inside the logarithmic rainbow bands?
- **Competitor parity:** lib.rainbow, coc.rainbow
- **Metrics:** new derived series only
- **New metrics required:** rainbow_bands
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: USD (log)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: rainbow_bands

**Expected:**
- Show price against logarithmic growth bands.

**Acceptance:**
- [ ] Band boundaries follow the documented model.
- [ ] Log scale is mandatory and labelled.
- [ ] Price overlay uses the same log axis.

---

## entity.exchange_balances — Exchange Balances & Netflow

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** line_dual_axis
- **Question:** How much BTC sits on exchanges and is it flowing in or out?
- **Competitor parity:** coc.exchange_balances, lib.exchange_balances
- **Metrics:** new derived series only
- **New metrics required:** exchange_balance_btc, exchange_netflow_btc, exchange_inflow_btc, exchange_outflow_btc
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: exchange_balance_btc, exchange_netflow_btc, exchange_inflow_btc, exchange_outflow_btc

**Expected:**
- Track exchange-held BTC and netflow as a proxy for sell-side supply.

**Acceptance:**
- [ ] Exchange balances reconcile with the labelled address set.
- [ ] Netflow equals inflow minus outflow.
- [ ] Entity labels are versioned and auditable.

---

## etf.market — ETF Market Dashboard

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** dashboard_grid
- **Question:** How are ETF flows, holdings and trading activity evolving?
- **Competitor parity:** coc.etf_price_volume_mvrv, coc.etf_dominance, coc.aggregate_volume
- **Metrics:** new derived series only
- **New metrics required:** etf_price, etf_volume_usd, etf_mvrv, etf_dominance, aggregate_volume_usd, etf_cash_carry
- **Default metric:** n/a
- **Chart types:** grid
- **Panes:** multi
- **Axes:** none (composite/table)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: etf_price, etf_volume_usd, etf_mvrv, etf_dominance, aggregate_volume_usd, etf_cash_carry

**Expected:**
- Combine ETF flows, balances, price/volume and cash-and-carry.

**Acceptance:**
- [ ] All cards share range and freshness.
- [ ] ETF dominance denominator is documented.
- [ ] Aggregate volume categories are labelled.

---

## flow.capital_rotation — Capital Rotation

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Is capital rotating into BTC or stalling?
- **Competitor parity:** coc.capital_rotation, coc.rcap_net_position_change, coc.marketcap_gained_per_dollar
- **Metrics:** new derived series only
- **New metrics required:** realized_cap_net_position_change, stablecoin_supply_usd, market_cap_gained_per_dollar
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: USD (linear); right: ratio (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: realized_cap_net_position_change, stablecoin_supply_usd, market_cap_gained_per_dollar

**Expected:**
- Track net realized capital flows and stablecoin liquidity.

**Acceptance:**
- [ ] Realized cap net change equals the 30-day difference.
- [ ] Market cap gained per dollar is labelled and bounded.
- [ ] Stablecoin supply source and freshness are shown.

---

## flow.lifespan_signals — Lifespan Signals

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Are old coins moving and is seller exhaustion building?
- **Competitor parity:** coc.binary_cdd, coc.seller_exhaustion, coc.consecutive_days
- **Metrics:** new derived series only
- **New metrics required:** binary_cdd, seller_exhaustion, consecutive_days_mvrv_above_1, consecutive_days_sopr_above_1
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: score (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: binary_cdd, seller_exhaustion, consecutive_days_mvrv_above_1, consecutive_days_sopr_above_1

**Expected:**
- Flag statistically significant coinday destruction and trend persistence.

**Acceptance:**
- [ ] Binary CDD threshold is documented and reproducible.
- [ ] Consecutive-day counters reset correctly on a break.
- [ ] Seller exhaustion formula is public and labelled.

---

## mining.models — Mining Models

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** What do mining cost and difficulty models imply about price?
- **Competitor parity:** coc.difficulty_regression, coc.difficulty_per_issuance, coc.miner_profitable_days, coc.mining_pulse
- **Metrics:** new derived series only
- **New metrics required:** difficulty_regression_price, difficulty_per_issuance, miner_profitable_days, mining_pulse
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: USD (log); right: ratio (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: difficulty_regression_price, difficulty_per_issuance, miner_profitable_days, mining_pulse

**Expected:**
- Show difficulty-based valuation and miner stress in one view.

**Acceptance:**
- [ ] Difficulty regression formula and fit window are documented.
- [ ] Profitable-days calculation uses the stated cost model.
- [ ] Mining pulse components are labelled and signed.

---

## supply.net_position_change — Supply Net Position Change

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** bar_series
- **Question:** Are holders accumulating or distributing?
- **Competitor parity:** coc.lth_netposchange, coc.wallet_netposchange, coc.absorption_rate
- **Metrics:** new derived series only
- **New metrics required:** lth_net_position_change_30d, wallet_net_position_change_30d, absorption_rate_30d
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: BTC (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: lth_net_position_change_30d, wallet_net_position_change_30d, absorption_rate_30d

**Expected:**
- Show 30-day net position change by cohort and absorption.

**Acceptance:**
- [ ] Net change equals current supply minus 30-day lagged supply.
- [ ] Absorption rate formula is documented.
- [ ] Cohort boundaries are labelled.

---

## technical.inflation_adjusted — Inflation-Adjusted Price

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** line_dual_axis
- **Question:** What does price look like after inflation?
- **Competitor parity:** coc.inflation_adjusted_price, lib.inflation_adjusted
- **Metrics:** new derived series only
- **New metrics required:** inflation_adjusted_price, inflation_adjusted_drawdown
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: USD (log); right: pct (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: inflation_adjusted_price, inflation_adjusted_drawdown

**Expected:**
- Deflate price by CPI and compare drawdowns.

**Acceptance:**
- [ ] CPI series and base year are documented.
- [ ] Real and nominal drawdowns are both available.

---

## technical.price_ranges — Price High/Low Range

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** How wide is the recent trading range?
- **Competitor parity:** coc.price_highlow_range
- **Metrics:** new derived series only
- **New metrics required:** price_range_7d, price_range_30d, price_range_90d
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: pct (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: price_range_7d, price_range_30d, price_range_90d

**Expected:**
- Compare short, medium and long rolling ranges.

**Acceptance:**
- [ ] Each range uses high-low over the stated window.
- [ ] Units are USD or percent and labelled.
- [ ] Missing days break the window rather than shrink silently.

---

## technical.risk_adjusted — Risk-Adjusted Returns

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** multi_series
- **Question:** Is BTC compensating for risk across windows?
- **Competitor parity:** coc.sharpe_sortino_calmar
- **Metrics:** new derived series only
- **New metrics required:** sharpe_30d, sortino_30d, calmar_365d
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: ratio (linear)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: sharpe_30d, sortino_30d, calmar_365d

**Expected:**
- Compare Sharpe, Sortino and Calmar with explicit windows.

**Acceptance:**
- [ ] Each ratio uses the documented risk-free rate and window.
- [ ] Division by zero renders a gap.
- [ ] Ratios are labelled with their window.

---

## valuation.monetary_premium — Monetary Premium

- **Status:** new
- **Implementation:** not_started
- **Phase:** phase_17_parity_extension
- **Priority:** P2
- **Archetype:** line_oscillator
- **Question:** How much premium does the market pay over thermocap?
- **Competitor parity:** coc.monetary_premium
- **Metrics:** new derived series only
- **New metrics required:** monetary_premium
- **Default metric:** n/a
- **Chart types:** line
- **Panes:** metric
- **Axes:** left: ratio (linear); right: USD (log)
- **Variants:** grain only
- **Default series:** composite/dashboard (see expected)
- **Controls:** range, grain, legend, crosshair, screenshot, csv
- **Annotations:** crosshair, last_value
- **Data freshness:** daily
- **Data requirements:** New derived series or external ingest required: monetary_premium

**Expected:**
- Compare market value with the cost of production (thermocap).

**Acceptance:**
- [ ] Monetary premium equals market cap / thermocap.
- [ ] Zero/negative handling is explicit.

---
