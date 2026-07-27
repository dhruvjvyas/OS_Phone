/* timewords.js — the clock refuses digits.
   24h time rendered as words: 15:34 -> "Fifteen thirty-four" */

const TimeWords = (() => {
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen"
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty"];

  function num(n) {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* "Fifteen thirty-four" | 15:00 -> "Fifteen hundred" | 15:05 -> "Fifteen oh-five" */
  function words(date = new Date()) {
    const h = date.getHours();
    const m = date.getMinutes();
    const hourWord = cap(num(h));
    if (m === 0) return { hour: hourWord, minute: "hundred" };
    if (m < 10) return { hour: hourWord, minute: `oh-${num(m)}` };
    return { hour: hourWord, minute: num(m) };
  }

  function inline(date = new Date()) {
    const w = words(date);
    return `${w.hour} ${w.minute}`;
  }

  function stacked(date = new Date()) {
    const w = words(date);
    return `${w.hour}<br/>${w.minute}`;
  }

  return { inline, stacked };
})();
