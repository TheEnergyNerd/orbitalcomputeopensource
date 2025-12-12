# Chart Responsiveness Requirements

Charts must be width-responsive on desktop. Here's what keeps breaking and how to fix it:

## Problem
Charts have fixed pixel widths or don't resize with container.

## Solution

### CSS Container Requirements

```css
/* Container must have explicit width */
.chart-container {
  width: 100%;
  max-width: 100%;
  position: relative;
}

/* Chart canvas must fill container */
.chart-container canvas {
  width: 100% !important;
  height: auto !important;
}
```

### For Chart.js

```javascript
// In chart options, MUST set these:
const chart = new Chart(ctx, {
  options: {
    responsive: true,
    maintainAspectRatio: true, // or false if you want fixed height
    aspectRatio: 2, // width:height ratio (2 = twice as wide as tall)
    resizeDelay: 0,
  }
});
```

### For Recharts

```jsx
// WRONG - fixed dimensions
<LineChart width={800} height={400}>

// RIGHT - responsive container
<ResponsiveContainer width="100%" height={400}>
  <LineChart>
    ...
  </LineChart>
</ResponsiveContainer>
```

### For D3.js (Current Implementation)

```typescript
// Get container width dynamically
const container = svgRef.current.parentElement;
const containerWidth = container?.clientWidth || 600;
const isMobile = containerWidth < 640;

// Use full width minus padding on desktop
const width = isMobile 
  ? Math.min(containerWidth - 32, 600)
  : Math.max(600, containerWidth - 32); // Use full width minus padding

// Set SVG dimensions
svg.attr("width", width).attr("height", height);
```

## Common Mistakes to Avoid

1. **Don't set `width` in pixels on the chart itself** - use container width
2. **Don't forget `ResponsiveContainer` wrapper** (Recharts)
3. **Don't set `responsive: false`** in Chart.js options
4. **Parent container needs `width: 100%`**, not `fit-content`
5. **Avoid `overflow: hidden`** on parent without explicit dimensions
6. **Don't use `containerWidth * 0.9`** - use full width minus padding: `containerWidth - 32`

## Test by resizing browser window
Charts should smoothly rescale without breaking axis labels or legends.

