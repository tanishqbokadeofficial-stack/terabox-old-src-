// Human-like Mouse Movement Helper with Bezier Curve Trajectories & Visual Overlay
class MouseHelper {
  // Generate Bezier curve points between (startX, startY) and (endX, endY)
  generateBezierPath(startX, startY, endX, endY, steps = 25) {
    const points = [];
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.hypot(deltaX, deltaY);

    // Control point offsets based on distance and random curvature
    const deviation = (Math.random() - 0.5) * Math.min(distance * 0.4, 150);
    const cp1x = startX + deltaX * 0.25 - deviation;
    const cp1y = startY + deltaY * 0.25 + deviation;
    const cp2x = startX + deltaX * 0.75 + deviation;
    const cp2y = startY + deltaY * 0.75 - deviation;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const x = uuu * startX + 3 * uu * t * cp1x + 3 * u * tt * cp2x + ttt * endX;
      const y = uuu * startY + 3 * uu * t * cp1y + 3 * u * tt * cp2y + ttt * endY;

      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    return points;
  }

  // Move mouse smoothly with human trajectory to target X/Y coordinates
  async moveMouse(page, targetX, targetY, options = {}) {
    const steps = options.steps || 25;
    const delayPerStep = options.delayMs || 8;

    let currentX = page.__lastMouseX || 100;
    let currentY = page.__lastMouseY || 100;

    const path = this.generateBezierPath(currentX, currentY, targetX, targetY, steps);

    for (const pt of path) {
      await page.mouse.move(pt.x, pt.y).catch(() => {});
      page.__lastMouseX = pt.x;
      page.__lastMouseY = pt.y;

      await page.evaluate(({ x, y }) => {
        if (window.__updateCursorPos) {
          window.__updateCursorPos(x, y);
        }
      }, { x: pt.x, y: pt.y }).catch(() => {});

      if (delayPerStep > 0) {
        await new Promise(r => setTimeout(r, delayPerStep));
      }
    }
  }

  // Move mouse smoothly to element bounding box center & click with human trajectory
  async clickElement(page, selector, onLog = () => {}) {
    try {
      let box = null;
      let targetX = 0;
      let targetY = 0;

      const selectors = Array.isArray(selector) ? selector : [selector];
      let activeLocator = null;

      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            box = await loc.boundingBox().catch(() => null);
            if (box) {
              activeLocator = loc;
              break;
            }
          }
        } catch (e) {}
      }

      if (!box) return false;

      targetX = Math.round(box.x + box.width * (0.35 + Math.random() * 0.3));
      targetY = Math.round(box.y + box.height * (0.35 + Math.random() * 0.3));

      onLog(`[Mouse Trajectory] 🎯 Moving red-dot cursor along Bezier curve to (X: ${targetX}, Y: ${targetY})`, 'info');

      // Animate red dot smoothly along Bezier trajectory
      await this.moveMouse(page, targetX, targetY, { steps: 35, delayMs: 14 });

      // Visual click ripple effect on red dot
      await page.evaluate(({ x, y }) => {
        const dot = document.getElementById('terabox-human-cursor');
        if (dot) {
          dot.style.transform = `translate(${x}px, ${y}px) scale(0.65)`;
          setTimeout(() => {
            dot.style.transform = `translate(${x}px, ${y}px) scale(1)`;
          }, 150);
        }
      }, { x: targetX, y: targetY }).catch(() => {});

      // Dispatch physical mouse click at exact Bezier X/Y coordinates
      await page.mouse.click(targetX, targetY).catch(() => {});
      
      // Trigger DOM click without re-positioning browser mouse
      if (activeLocator) {
        await activeLocator.evaluate(el => {
          if (el.focus) el.focus();
          if (el.click) el.click();
        }).catch(() => {});
      }

      return true;
    } catch (err) {
      onLog(`[Mouse Helper Notice] ${err.message}`, 'warn');
      return false;
    }
  }

  // Type text character by character into focused element with natural human keystroke delay
  async typeHuman(page, text, delayMs = 70) {
    for (const char of text) {
      await page.keyboard.type(char, { delay: delayMs + Math.floor(Math.random() * 30) });
    }
  }

  // Guaranteed mouse trajectory targeting with fallback relative viewport position
  async clickTargetWithFallback(page, selectors, fallbackPercent = { x: 0.5, y: 0.5 }, label = '', onLog = () => {}) {
    try {
      let box = null;
      let targetX = 0;
      let targetY = 0;

      const selList = Array.isArray(selectors) ? selectors : [selectors];
      let activeLocator = null;

      for (const sel of selList) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            box = await loc.boundingBox().catch(() => null);
            if (box) {
              activeLocator = loc;
              break;
            }
          }
        } catch (e) {}
      }

      const viewport = page.viewportSize() || { width: 1280, height: 800 };

      if (box) {
        targetX = Math.round(box.x + box.width * (0.35 + Math.random() * 0.3));
        targetY = Math.round(box.y + box.height * (0.35 + Math.random() * 0.3));
      } else {
        targetX = Math.round(viewport.width * fallbackPercent.x);
        targetY = Math.round(viewport.height * fallbackPercent.y);
      }

      onLog(`[Mouse Trajectory] 🎯 Moving red-dot cursor to target "${label}" at (X: ${targetX}, Y: ${targetY})`, 'info');

      // Animate red dot along Bezier path
      await this.moveMouse(page, targetX, targetY, { steps: 35, delayMs: 14 });

      // Visual click ripple effect
      await page.evaluate(({ x, y }) => {
        const dot = document.getElementById('terabox-human-cursor');
        if (dot) {
          dot.style.transform = `translate(${x}px, ${y}px) scale(0.65)`;
          setTimeout(() => {
            dot.style.transform = `translate(${x}px, ${y}px) scale(1)`;
          }, 150);
        }
      }, { x: targetX, y: targetY }).catch(() => {});

      // Dispatch physical mouse click at coordinates
      await page.mouse.click(targetX, targetY).catch(() => {});

      if (activeLocator) {
        await activeLocator.evaluate(el => {
          if (el.focus) el.focus();
          if (el.click) el.click();
        }).catch(() => {});
      }

      return true;
    } catch (err) {
      onLog(`[Mouse Helper Notice] ${err.message}`, 'warn');
      return false;
    }
  }
}

module.exports = new MouseHelper();
