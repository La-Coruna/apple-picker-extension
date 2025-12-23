# 🍎 Apple Picker

Apple Picker is a Chrome extension that helps players analyze the Apple Picker puzzle game by visually highlighting valid selections whose tile values sum to 10.

The extension reads the game’s internal CreateJS tile state in real time and overlays visual hints directly on the game canvas, without modifying the game or automating any input.

---

## ✨ Features

- Highlights valid rectangular or straight-line selections with a total sum of 10  
- Uses internal CreateJS tile state for accurate detection (no OCR)  
- Works in real time during gameplay  
- Lightweight visual overlay only (no auto-clicking or automation)  
- Designed as a puzzle analysis and practice tool  

---

## 🧠 How It Works

- The game board is modeled as a 2D grid of numeric tiles  
- All possible rectangles and straight lines are evaluated using efficient area-sum checks  
- Valid sum-10 selections are detected and highlighted on the canvas  
- All logic runs locally inside the browser  

This puzzle is computationally intractable to solve optimally at full scale, so the extension focuses on fast, near-optimal move detection rather than exhaustive search.

---

## 🧩 Use Case

- Practice recognizing high-value patterns  
- Understand how different moves affect future possibilities  
- Analyze puzzle mechanics more deeply without modifying gameplay  

---

## 🔐 Privacy

Apple Picker does not collect, store, or transmit any user data.  
All analysis is performed locally on the active game page.

See `PRIVACY.md` for details.

---

## ⚠️ Disclaimer

This project is intended for educational and analytical purposes only.  
It does not automate gameplay or interact with official leaderboards.