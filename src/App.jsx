import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { LanguageToggle } from "./components/LanguageToggle";
import orbImage from "./assets/ball.svg";

// ======= Config =======
const REVIEW_URL = "/api/review";

// ======= i18n (AR / EN) =======
const TRANSLATIONS = {
  arabic: {
    logoAlt: "شعار الجامعة",
    title: "معالجة الخبر",
    inputLabel: "ألصق نص المقال المراد مراجعته",
    ariaInput: "مربع إدخال نص المقال لمراجعته",
    errorNoQuery: "ألصق نص الخبر أولًا.",
    errorFetch: "تعذر الحصول على النتيجة",
    errorUnexpected: "حدث خطأ غير متوقع.",
    reviewHeading: "النتيجة النهائية للمراجعة",
    copyVerificationAria: "نسخ نتيجة المراجعة",
    copyResult: "نسخ النتيجة",
    copied: "تم النسخ!",
    checkBtnAria: "زر مراجعة الخبر",
    checking: "جاري المراجعة…",
    checkNow: "ابدأ الآن",
    heroDescription:
      "ضع نص المقال كاملاً، وسنراجع المحتوى ونقدم لك الخلاصة النهائية بعد التحليل.",
    loaderLine: "محرك المراجعة يعمل… قراءة النص وتحليل المحتوى لإعداد الخلاصة.",
  },
  english: {
    logoAlt: "University Logo",
    title: "News Review",
    inputLabel: "Paste the article text to review",
    placeholder: "Example: Paste the full news article here...",
    ariaInput: "Text input for article review",
    errorNoQuery: "Please paste the article text first.",
    errorFetch: "Failed to get result",
    errorUnexpected: "An unexpected error occurred.",
    reviewHeading: "Final Review Result",
    copyVerificationAria: "Copy review result",
    copyResult: "Copy Result",
    copied: "Copied!",
    checkBtnAria: "Review article button",
    checking: "Reviewing...",
    checkNow: "Review Now",
    heroDescription:
      "Paste the full article text and we'll analyze it to deliver a final AI-generated review.",
    loaderLine:
      "The review engine is working… reading the article, analyzing the content, and shaping the final insight.",
  }
};

// ======= Helpers =======
const urlRegex =
  /((https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

function toAbsoluteUrl(maybeUrl) {
  if (!/^https?:\/\//i.test(maybeUrl)) return `https://${maybeUrl}`;
  return maybeUrl;
}

function getDomain(u) {
  try {
    const url = new URL(toAbsoluteUrl(u));
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return (u || "").replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "");
  }
}

function faviconUrl(domain) {
  const d = (domain || "").trim();
  if (!d) return "";
  return `https://icons.duckduckgo.com/ip3/${d}.ico`;
}

// ========= New: List-aware renderer (fix numbers mess) =========
const ENUM_LINE = /^\s*([0-9\u0660-\u0669]+)[\.\):\-]\s+(.+)$/; // 1. , 1) , ١. , ١)
function splitIntoBlocks(text) {
  // يقسم النص إلى بلوكات: فقرة عادية أو قائمة مرقّمة متتالية
  const lines = (text || "").split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // تخطّي الأسطر الفارغة المتتالية
    if (!line.trim()) {
      i++;
      continue;
    }

    // لو بداية قائمة مرقّمة
    if (ENUM_LINE.test(line)) {
      const items = [];
      while (i < lines.length && ENUM_LINE.test(lines[i])) {
        const m = lines[i].match(ENUM_LINE);
        items.push(m[2]); // المحتوى بدون الرقم، هنربطه بعدين باللينكات
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // غير ذلك: اجمع لحد سطر فاضي أو لحد قائمة جديدة
    const buff = [];
    while (i < lines.length && lines[i].trim() && !ENUM_LINE.test(lines[i])) {
      buff.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buff.join(" ") });
  }
  return blocks;
}

// يحوّل نص إلى عناصر React مع أزرار للروابط داخل الفقرات/العناصر
function linkifyText(txt) {
  if (!txt) return null;

  // 1) Markdown links [label](url)
  const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let last = 0, m;

  while ((m = md.exec(txt)) !== null) {
    const [full, label, href] = m;
    const start = m.index;
    if (start > last) parts.push(txt.slice(last, start));
    parts.push(<LinkChip key={`md-${start}`} href={href} label={label} />);
    last = start + full.length;
  }
  if (last < txt.length) parts.push(txt.slice(last));

  // 2) Raw URLs
  const out = [];
  parts.forEach((p, idx) => {
    if (typeof p !== "string") { out.push(p); return; }
    let l = 0, hit;
    while ((hit = urlRegex.exec(p)) !== null) {
      const raw = hit[0], s = hit.index;
      if (s > l) out.push(p.slice(l, s));
      out.push(<LinkChip key={`url-${idx}-${s}`} href={toAbsoluteUrl(raw)} />);
      l = s + raw.length;
    }
    if (l < p.length) out.push(p.slice(l));
  });

  return out.map((node, i) => typeof node === "string" ? <span key={`t-${i}`}>{node}</span> : node);
}

function renderTalkSmart(talk) {
  const blocks = splitIntoBlocks(talk || "");
  return blocks.map((b, idx) => {
    if (b.type === "ol") {
      return (
        <ol
          key={`b-${idx}`}
          dir="rtl"
          className="nice-ol ms-4 my-3 grid gap-2"
        >
          {b.items.map((it, j) => (
            <li key={`it-${j}`} className="leading-8 pe-2">
              {linkifyText(it)}
            </li>
          ))}
        </ol>
      );
    }
    // فقرة عادية
    return (
      <p key={`b-${idx}`} className="leading-8 my-2">
        {linkifyText(b.text)}
      </p>
    );
  });
}

// ======= Component =======
function AINewsReview() {
  const { isArabic, language } = useLanguage();
  const T = TRANSLATIONS[language] || TRANSLATIONS.english;
  const [query, setQuery] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 400) + 'px';
    }
  }, [query]);

  async function handleCheck() {
    setErr("");
    setReview("");
    const q = query.trim();
    if (!q) {
      setErr(T.errorNoQuery);
      return;
    }

    setLoading(true);
    try {
      console.log("🔍 Sending review request to:", REVIEW_URL);
      console.log("📝 Request body:", {
        news_text: q,
      });

      const res = await fetch(REVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          news_text: q,
        }),
      });

      console.log("📡 Response status:", res.status, res.statusText);

      const text = await res.text();
      console.log("📄 Response text:", text);

      if (!text.trim()) {
        throw new Error("Server returned empty response");
      }

      let data;
      try {
        data = JSON.parse(text);
        console.log("✅ Parsed JSON data:", data);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        console.error("Response text:", text);
        throw new Error("Invalid JSON response from server");
      }

      if (!res.ok) {
        throw new Error(data?.error || T.errorFetch);
      }

      if (!data?.review) {
        throw new Error(T.errorUnexpected);
      }

      setReview(data.review);
    } catch (e) {
      console.error("Error in handleCheck:", e);
      setErr(e.message || T.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!review) return;

    navigator.clipboard.writeText(review).then(() => {
      // Show success feedback
      const originalText = T.copyResult;
      const button =
        document.querySelector('[aria-label*="نسخ"]') ||
        document.querySelector('[aria-label*="Copy"]');
      if (button) {
        const originalContent = button.textContent;
        button.textContent = T.copied;
        button.style.background = 'linear-gradient(to right, #10b981, #059669)';
        setTimeout(() => {
          button.textContent = originalContent;
          button.style.background = '';
        }, 2000);
      }
    });
  }

  const renderedReview = useMemo(() => renderTalkSmart(review || ""), [review]);

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="min-h-screen relative overflow-hidden transition-colors duration-500 px-3 sm:px-0 bg-[#05070e] text-white">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full blur-3xl bg-[radial-gradient(circle_at_center,_rgba(88,101,242,0.18),_transparent_60%)] animate-slow-pulse" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[55vw] h-[55vw] rounded-full blur-3xl bg-[radial-gradient(circle_at_center,_rgba(24,182,155,0.18),_transparent_60%)] animate-slow-pulse delay-300" />
      </div>

      {/* Language Toggle */}
      <div
        className="absolute z-20 flex sm:flex-col flex-row gap-2 sm:gap-4 top-2 left-2 sm:top-6 sm:left-6 scale-75 sm:scale-100"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.25rem)' }}
      >
        <LanguageToggle />
      </div>

      {/* AI orb / character */}
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="mx-auto pt-16 sm:pt-10 flex flex-col items-center gap-4"
      >
        <motion.div
          className="relative mb-4"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* AI Glow Effect */}
          <div className="absolute -inset-8 rounded-full bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-teal-500/15 blur-2xl animate-pulse" />
          <div className="absolute -inset-6 rounded-full bg-gradient-to-r from-indigo-400/20 via-purple-400/20 to-teal-400/20 blur-xl animate-pulse delay-300" />
          
          {/* Circular Logo Container */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 mx-auto">
            {/* Rotating Stars Orbit */}
            <div className="absolute inset-0">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={`star-${i}`}
                  className="absolute w-2 h-2"
                style={{
                    left: '50%',
                    top: '50%',
                    transformOrigin: '0 0',
                    transform: `rotate(${i * 30}deg) translateX(60px) translateY(-4px)`
                  }}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.1
                  }}
                >
                  <motion.div
                    className="w-2 h-2 bg-gradient-to-r from-yellow-300 to-yellow-100 rounded-full shadow-lg"
                    animate={{
                      scale: [0.8, 1.2, 0.8],
                      opacity: [0.6, 1, 0.6],
                      boxShadow: [
                        '0 0 8px rgba(255, 255, 255, 0.3)',
                        '0 0 16px rgba(255, 255, 255, 0.6)',
                        '0 0 8px rgba(255, 255, 255, 0.3)'
                      ]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>
            ))}
          </div>

            {/* Inner Rotating Stars */}
            <div className="absolute inset-4">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={`inner-star-${i}`}
                  className="absolute w-1.5 h-1.5"
                style={{
                    left: '50%',
                    top: '50%',
                    transformOrigin: '0 0',
                    transform: `rotate(${i * 45}deg) translateX(40px) translateY(-3px)`
                  }}
                  animate={{ rotate: -360 }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.15
                  }}
                >
                  <motion.div
                    className="w-1.5 h-1.5 bg-gradient-to-r from-blue-300 to-cyan-200 rounded-full"
                    animate={{
                      scale: [0.5, 1, 0.5],
                      opacity: [0.4, 0.9, 0.4]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>
            ))}
          </div>

            {/* Circular Logo */}
            <motion.div
              className="relative w-full h-full rounded-full overflow-hidden border-2 border-white/30 shadow-2xl"
              whileHover={{ 
                scale: 1.05,
                rotateY: 10,
                rotateX: 5
              }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 20 
              }}
            >
              {/* Holographic Overlay */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-60" />
              
              {/* Logo Image */}
              <motion.img
                src={orbImage}
                alt={T.logoAlt}
                className="w-full h-full object-cover select-none"
                draggable="false"
                whileHover={{ 
                  scale: 1.02,
                  filter: "brightness(1.1) saturate(1.2)"
                }}
                transition={{ 
                  type: "spring", 
                  stiffness: 400, 
                  damping: 25 
                }}
              />
              
              {/* Pulsing Ring */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/40"
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.8, 0.3]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </motion.div>
            
            {/* Outer Energy Rings */}
            <div className="absolute -inset-2 rounded-full border border-white/20 animate-spin-slow" />
            <div className="absolute -inset-4 rounded-full border border-white/10 animate-spin-reverse" />
            <div className="absolute -inset-6 rounded-full border border-white/5 animate-spin-slow" />
        </div>
        </motion.div>
        <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-center">
          {T.title}
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-center max-w-[90vw] sm:max-w-xl md:max-w-2xl text-white/70">
          {T.heroDescription}
        </p>
      </motion.div>

      {/* Main card */}
      <div className="relative z-10 mx-auto mt-6 sm:mt-8 w-full max-w-3xl p-1 rounded-2xl bg-gradient-to-r from-indigo-500/30 via-fuchsia-500/30 to-teal-500/30">
        <div className="rounded-2xl backdrop-blur-xl p-4 sm:p-6 bg-[#0a0f1c]/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
          {/* Input */}
          <div className="flex flex-col gap-3">
            <label className="text-sm text-white/70">
              {T.inputLabel}
            </label>
            <motion.textarea
              ref={textareaRef}
              className="min-h-[60px] max-h-[400px] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus:outline-none focus:ring-2 transition-all duration-300 resize-none bg-[#0b1327] border border-white/20 focus:ring-indigo-400/60 shadow-[0_0_20px_rgba(99,102,241,.08)] text-white placeholder-white/60 overflow-y-auto"
              placeholder={T.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleCheck();
                }
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                e.target.style.boxShadow = '0 0 30px rgba(99, 102, 241, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.08)';
              }}
              aria-label={T.ariaInput}
              aria-describedby="input-help"
              rows={1}
              whileFocus={{ 
                scale: 1.01,
                transition: { duration: 0.2 }
              }}
            />

            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <motion.button
                onClick={handleCheck}
                disabled={loading}
                className="relative px-5 py-3 sm:px-8 sm:py-4 rounded-2xl font-semibold sm:font-bold text-base sm:text-lg overflow-hidden transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed group focus:outline-none focus:ring-4 focus:ring-indigo-400/50 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_20px_40px_rgba(99,102,241,.4)]"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: '0_25px_50px_rgba(99,102,241,.6)'
                }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                aria-label={T.checkBtnAria}
                tabIndex={0}
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Shimmer effect */}
                <div className="absolute inset-0 -top-2 -left-2 w-[calc(100%+16px)] h-[calc(100%+16px)] bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                
                {/* Button content */}
                <span className="relative z-10 flex items-center gap-2">
                  {loading ? (
                    <>
                      <motion.div
                        className="relative w-5 h-5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {/* Outer spinning ring */}
                        <motion.div
                          className="absolute inset-0 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        {/* Inner pulsing dot */}
                        <motion.div
                          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2"
                          animate={{ 
                            scale: [1, 1.5, 1],
                            opacity: [0.5, 1, 0.5]
                          }}
                          transition={{ 
                            duration: 1.5, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        />
                      </motion.div>
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      >
                        {T.checking}
                      </motion.span>
                    </>
                  ) : (
                    <>
                      <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                      >
                        ✅
                      </motion.span>
                      <span>{T.checkNow}</span>
                    </>
                  )}
                </span>
                
                {/* Glow effect */}
                <div className="absolute -inset-1 rounded-2xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400" />
              </motion.button>

              {review && (
                <motion.button
                  onClick={copyAll}
                  className="px-5 py-2.5 rounded-xl transition font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/50 bg-white/10 hover:bg-white/15 border border-white/10"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={T.copyVerificationAria}
                  tabIndex={0}
                >
                  {T.copyResult}
                </motion.button>
              )}
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 rounded-2xl px-6 py-5 bg-gradient-to-br from-red-950/80 via-red-900/70 to-red-950/80 border-2 border-red-700/70 shadow-[0_8px_32px_rgba(185,28,28,0.4)]"
                role="alert"
                aria-live="polite"
                dir={isArabic ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center gap-4">
                  <motion.span 
                    className="text-4xl flex-shrink-0"
                    animate={{ 
                      scale: [1, 1.15, 1],
                      rotate: [0, -10, 10, 0]
                    }}
                    transition={{ 
                      duration: 2.5, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                  >
                    ⚠️
                  </motion.span>
                  <p className="text-white/95 font-medium text-[15px] sm:text-base leading-loose flex-1">
                    {err}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loader */}
          <AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
                <ManufacturingLoader />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          <AnimatePresence>
            {review && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="mt-8 grid gap-6"
              >
                <motion.div
                  className="rounded-2xl p-6 sm:p-7 bg-white/8 border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,.2)]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <NeonDot color="rgba(99,102,241,1)" />
                    <h3 className="text-2xl font-extrabold">{T.reviewHeading}</h3>
                  </div>
                  <div className="prose max-w-none leading-8 text-base prose-invert whitespace-pre-line">
                    {renderedReview}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Local styles for animations + ordered list */}
      <style>{`
        .animate-slow-pulse { animation: slowPulse 7s ease-in-out infinite; }
        .animate-orb-float { animation: orbFloat 6s ease-in-out infinite; }
        .animate-spin-slow { animation: spinSlow 14s linear infinite; }
        .animate-spin-reverse { animation: spinReverse 12s linear infinite; }
        .animate-pulse-glow { animation: pulseGlow 4s ease-in-out infinite; }
        .animate-pulse-glow-delayed { animation: pulseGlow 4s ease-in-out infinite 1s; }
        .animate-float-particle { animation: floatParticle 3s ease-in-out infinite; }
        .animate-energy-line { animation: energyLine 2s ease-in-out infinite; }
        .animate-light-sweep { animation: lightSweep 3s ease-in-out infinite; }
        .animate-core-pulse { animation: corePulse 2s ease-in-out infinite; }
        .animate-data-stream { animation: dataStream 8s linear infinite; }
        
        @keyframes slowPulse { 
          0%, 100% { transform: scale(1); opacity: .9; } 
          50% { transform: scale(1.08); opacity: 1; } 
        }
        @keyframes orbFloat { 
          0%, 100% { transform: translateY(0px) scale(1); } 
          50% { transform: translateY(-10px) scale(1.05); } 
        }
        @keyframes spinSlow { 
          to { transform: rotate(360deg); } 
        }
        @keyframes spinReverse { 
          to { transform: rotate(-360deg); } 
        }
        @keyframes pulseGlow { 
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.3; 
            filter: blur(8px);
          } 
          50% { 
            transform: scale(1.2); 
            opacity: 0.6; 
            filter: blur(12px);
          } 
        }
        @keyframes floatParticle { 
          0%, 100% { 
            transform: translateY(0px) translateX(0px) scale(1); 
            opacity: 0.6; 
          } 
          25% { 
            transform: translateY(-15px) translateX(5px) scale(1.2); 
            opacity: 1; 
          } 
          50% { 
            transform: translateY(-25px) translateX(-5px) scale(0.8); 
            opacity: 0.8; 
          } 
          75% { 
            transform: translateY(-10px) translateX(8px) scale(1.1); 
            opacity: 0.9; 
          } 
        }
        @keyframes energyLine { 
          0%, 100% { 
            transform: scaleY(0.3) rotate(var(--rotation, 0deg)); 
            opacity: 0.3; 
          } 
          50% { 
            transform: scaleY(1.2) rotate(var(--rotation, 0deg)); 
            opacity: 0.8; 
          } 
        }
        @keyframes lightSweep { 
          0% { 
            transform: translateX(-100%) rotate(0deg); 
            opacity: 0; 
          } 
          50% { 
            opacity: 1; 
          } 
          100% { 
            transform: translateX(100%) rotate(180deg); 
            opacity: 0; 
          } 
        }
        @keyframes corePulse { 
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.6; 
          } 
          50% { 
            transform: scale(1.1); 
            opacity: 1; 
          } 
        }
        @keyframes dataStream { 
          0% { 
            transform: rotate(0deg) scale(1); 
            opacity: 0.3; 
          } 
          25% { 
            opacity: 0.6; 
          } 
          50% { 
            transform: rotate(180deg) scale(1.05); 
            opacity: 0.4; 
          } 
          75% { 
            opacity: 0.7; 
          } 
          100% { 
            transform: rotate(360deg) scale(1); 
            opacity: 0.3; 
          } 
        }

        /* Ordered list بترقيم عربي أنيق */
        .nice-ol {
          list-style: none;
          counter-reset: item;
          padding-inline-start: 0;
        }
        .nice-ol > li {
          counter-increment: item;
          position: relative;
          padding-right: 2.2em; /* مسافة الرقم */
        }
        .nice-ol > li::before {
          content: counter(item, arabic-indic) "‎. ";
          /* arabic-indic يعمل على معظم المتصفحات الحديثة */
          position: absolute;
          right: 0;
          top: 0;
          font-weight: 800;
          color: #7dd3fc; /* سماوي لطيف */
        }
      `}</style>
    </div>
  );
}

/* ----------------- Small UI atoms ----------------- */
function NeonDot({ color = "rgba(99,102,241,1)" }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 18px ${color}` }}
    />
  );
}

function LinkChip({ href, label, big = false }) {
  if (!href) return null;
  const abs = toAbsoluteUrl(href);
  const domain = getDomain(abs);
  const text = label?.trim() || domain;

  return (
    <a
      href={abs}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 rounded-xl transition px-3 py-2 ${big ? "w-full" : ""} border border-white/10 bg-[#0b1327]/40 hover:bg-[#0b1327]/60 shadow-[0_0_12px_rgba(56,189,248,.12)]`}
      title={text}
    >
      <img
        src={faviconUrl(domain)}
        alt=""
        className={`${big ? "w-6 h-6" : "w-4.5 h-4.5"} rounded`}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      <span className={`truncate ${big ? "text-[15px] font-semibold" : "text-sm"}`}>
        {text}
      </span>
      <span className="ms-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition text-sky-300">
        ↗
      </span>
    </a>
  );
}


function ManufacturingLoader() {
  const { language } = useLanguage();
  const T = TRANSLATIONS[language] || TRANSLATIONS.english;

  return (
    <div
      className="rounded-2xl p-5 overflow-hidden bg-[#0b1327]/50 border border-white/10"
    >
      <div className="flex items-center gap-3 mb-4">
        <NeonDot color="rgba(56,189,248,1)" />
        <p className="text-white/80">{T.loaderLine}</p>
      </div>
      <div
        className="relative h-12 overflow-hidden rounded-lg border bg-white/[.03] border-white/10"
      >
        <div className="absolute inset-0 flex items-center">
          <Conveyor />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <CodeBar />
        <CodeBar delay="0.35s" />
      </div>
    </div>
  );
}

function Conveyor() {
  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 flex items-center">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="mx-2 h-3 w-12 rounded bg-gradient-to-r from-indigo-400/40 to-fuchsia-400/40 animate-move-right"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <style>{`
        .animate-move-right { animation: moveRight 1.8s linear infinite; }
        @keyframes moveRight {
          0% { transform: translateX(-120%); opacity: .6; }
          50% { opacity: 1; }
          100% { transform: translateX(120%); opacity: .6; }
        }
      `}</style>
    </div>
  );
}

function CodeBar({ delay = "0s" }) {
  return (
    <div className="relative h-24 rounded-lg p-3 overflow-hidden bg-black/20 border border-white/10">
      <div className="absolute inset-0 opacity-20" style={{ 
        backgroundImage: "linear-gradient(transparent 70%, rgba(255,255,255,.04) 0%)", 
        backgroundSize: "100% 20px" 
      }} />
      <div className="space-y-2 animate-code-flow" style={{ animationDelay: delay }}>
        <div className="h-2.5 rounded w-3/4 bg-white/20" />
        <div className="h-2.5 rounded w-1/2 bg-white/15" />
        <div className="h-2.5 rounded w-5/6 bg-white/20" />
        <div className="h-2.5 rounded w-2/3 bg-white/15" />
      </div>
      <style>{`
        .animate-code-flow { animation: codeFlow 1.6s ease-in-out infinite; }
        @keyframes codeFlow {
          0%,100% { transform: translateY(0px); opacity: .9; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Main App component with LanguageProvider
export default function App() {
  return (
      <LanguageProvider>
        <AINewsReview />
      </LanguageProvider>
  );
}