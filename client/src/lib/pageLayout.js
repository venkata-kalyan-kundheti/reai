export function getVisiblePageRange(scrollTop, containerHeight, pageHeights = []) {
  if (pageHeights.length === 0) return [1, 1];
  let accumulated = 0;
  let start = 1;
  let end = 1;
  const bottom = scrollTop + containerHeight;

  for (let i = 0; i < pageHeights.length; i++) {
    const pageTop = accumulated;
    const pageBottom = accumulated + pageHeights[i];
    if (pageBottom >= scrollTop && pageTop <= bottom) {
      if (start === 1 && pageTop <= scrollTop) start = i + 1;
      end = i + 1;
    }
    accumulated += pageHeights[i] + 20; // 20px gap
  }

  return [Math.max(1, start), Math.max(start, end)];
}

