import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, Heart, Image as ImageIcon, Link, Lock,
  Music2, Palette, Save, Sparkles, Stars,
} from "lucide-react";
import { defaultConfig } from "../data/defaultConfig";
import { loadConfig, saveConfig, clearConfig } from "../lib/storage";
import { encodeConfig } from "../lib/share";

const PALETTES = [
  { id: "rose",     label: "Rose Mist" },
  { id: "lavender", label: "Lavender Moon" },
  { id: "peach",    label: "Peach Glow" },
];

const UNLOCK_OPTIONS = [
  { id: "scroll", label: "Scroll to Reveal" },
  { id: "time",   label: "Time Delay" },
  { id: "click",  label: "Heart Clicks" },
];

// ── tiny shared UI atoms ──────────────────────────────────────────────────────
function SectionTitle({ icon, children }) {
  return (
    <div className="flex items-center gap-3 text-rose-400">
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <h2 className="font-display text-2xl">{children}</h2>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      {label && (
        <label className="mb-2 block text-sm font-medium text-slate-600">{label}</label>
      )}
      {children}
    </div>
  );
}

function StyledInput({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-200 ${className}`}
      {...props}
    />
  );
}

function PillButton({ onClick, children, className = "" }) {
  return (
    <button
      className={`flex items-center gap-2 rounded-full border border-white/70 px-4 py-2 text-sm hover:bg-white/60 transition ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function Creator() {
  const navigate = useNavigate();
  const initial = useMemo(() => loadConfig() ?? defaultConfig, []);
  const [config, setConfig]       = useState(initial);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shareMsg, setShareMsg]   = useState("");
  const [cloudName, setCloudName] = useState(
    () => localStorage.getItem("cloudinary-cloud") ?? ""
  );
  const [uploadPreset, setUploadPreset] = useState(
    () => localStorage.getItem("cloudinary-preset") ?? ""
  );

  const hasEmbeddedAudio  = config.music.source?.startsWith("data:");
  const hasEmbeddedImages = config.photos.some((p) => p.src?.startsWith("data:"));

  // ── state helpers ─────────────────────────────────────────────────────
  const set = (field, value) => setConfig((prev) => ({ ...prev, [field]: value }));
  const setNested = (field, patch) =>
    setConfig((prev) => ({ ...prev, [field]: { ...prev[field], ...patch } }));

  const setPhoto = (i, patch) =>
    setConfig((prev) => {
      const photos = [...prev.photos];
      photos[i] = { ...photos[i], ...patch };
      return { ...prev, photos };
    });

  const movePhoto = (from, to) =>
    setConfig((prev) => {
      const photos = [...prev.photos];
      const [item] = photos.splice(from, 1);
      photos.splice(to, 0, item);
      return { ...prev, photos };
    });

  const setTimeline = (i, patch) =>
    setConfig((prev) => {
      const timeline = [...prev.timeline];
      timeline[i] = { ...timeline[i], ...patch };
      return { ...prev, timeline };
    });

  const removeTimeline = (i) =>
    setConfig((prev) => ({ ...prev, timeline: prev.timeline.filter((_, idx) => idx !== i) }));

  const addPhoto = () =>
    setConfig((prev) => ({ ...prev, photos: [...prev.photos, { src: "", caption: "" }] }));

  const addTimelineItem = () =>
    setConfig((prev) => ({
      ...prev,
      timeline: [
        ...prev.timeline,
        { title: "New Memory", date: new Date().toISOString().slice(0, 10), emoji: "✨", description: "" },
      ],
    }));

  // ── image optimizer ───────────────────────────────────────────────────
  const optimizeImage = (file) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          const maxPx = 1600;
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not supported"));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── upload handlers ───────────────────────────────────────────────────
  const localUpload = async (file, onLoad, kind = "file") => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert("Keep files under 12 MB."); return; }
    if (kind === "image") {
      try { onLoad(await optimizeImage(file)); } catch (err) { console.error(err); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result);
    reader.readAsDataURL(file);
  };

  const cloudUpload = async (file, onLoad, resourceType) => {
    if (!file) return;
    if (!cloudName || !uploadPreset) { alert("Add Cloudinary credentials first."); return; }
    try {
      setUploading(true);
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", uploadPreset);
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url  = data.secure_url || data.url || "";
      if (url) onLoad(url);
    } catch (err) {
      console.error(err);
      alert("Upload failed. Check your Cloudinary settings.");
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoFile = (file, i) =>
    cloudName && uploadPreset
      ? cloudUpload(file, (src) => setPhoto(i, { src }), "image")
      : localUpload(file, (src) => setPhoto(i, { src }), "image");

  const handleAudioFile = (file) =>
    cloudName && uploadPreset
      ? cloudUpload(file, (src) => setNested("music", { source: src }), "video")
      : localUpload(file, (src) => setNested("music", { source: src }));

  // ── JSON import / export ──────────────────────────────────────────────
  const downloadJson = () => {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })),
      download: "anniversary-gift.json",
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const importJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { const p = JSON.parse(reader.result); setConfig(p); saveConfig(p); }
      catch { alert("Invalid JSON file."); }
    };
    reader.readAsText(file);
  };

  // ── share link ────────────────────────────────────────────────────────
  const flash = (msg) => { setShareMsg(msg); setTimeout(() => setShareMsg(""), 3500); };

  const handleShareLink = async () => {
    if (uploading)                          return flash("Uploads still running. Please wait.");
    if (hasEmbeddedImages || hasEmbeddedAudio) return flash("Use Cloudinary-hosted media for a shareable link.");
    const encoded = encodeConfig(config);
    if (!encoded) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/anniversary?data=${encoded}`);
      flash("Share link copied! Send it to your partner. 💌");
    } catch {
      flash("Copy failed. Try again or copy from the address bar.");
    }
  };

  const saveAndPreview = () => {
    setSaving(true);
    saveConfig(config);
    setTimeout(() => { setSaving(false); navigate("/anniversary"); }, 400);
  };

  // ── JSX ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-10 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-rose-500">
            <Sparkles className="h-6 w-6" />
            <span className="text-sm uppercase tracking-[0.4em]">Creator Mode</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl">Create Your Anniversary Memory</h1>
          <p className="max-w-2xl text-lg text-slate-600">
            Fill these moments with love. We will turn them into magic.
          </p>
        </header>

        <section className="glass rounded-3xl p-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">

            {/* ── Left column ── */}
            <div className="space-y-6">

              {/* Names */}
              <SectionTitle icon={<Heart />}>Names</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <StyledInput value={config.creatorName} placeholder="Romeo"
                    onChange={(e) => set("creatorName", e.target.value)} />
                </Field>
                <Field label="Partner name">
                  <StyledInput value={config.partnerName} placeholder="Juliet"
                    onChange={(e) => set("partnerName", e.target.value)} />
                </Field>
              </div>
              <div className="rounded-2xl bg-white/60 p-4 text-center text-lg font-semibold">
                {config.creatorName || "You"} ❤️ {config.partnerName || "Your Love"}
              </div>
              <Field label="Anniversary date">
                <StyledInput type="date" value={config.anniversaryDate}
                  onChange={(e) => set("anniversaryDate", e.target.value)} />
              </Field>

              {/* Photos */}
              <SectionTitle icon={<ImageIcon />}>Photos</SectionTitle>
              <div className="space-y-4">
                {config.photos.map((photo, i) => (
                  <div key={i} className="rounded-2xl border border-white/70 bg-white/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-500">Memory {i + 1}</span>
                      <div className="flex gap-2">
                        <PillButton onClick={() => i > 0 && movePhoto(i, i - 1)}>↑</PillButton>
                        <PillButton onClick={() => i < config.photos.length - 1 && movePhoto(i, i + 1)}>↓</PillButton>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StyledInput placeholder="Paste image URL" value={photo.src}
                        onChange={(e) => setPhoto(i, { src: e.target.value })} />
                      <StyledInput placeholder="Caption" value={photo.caption}
                        onChange={(e) => setPhoto(i, { caption: e.target.value })} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input type="file" accept="image/*"
                        onChange={(e) => handlePhotoFile(e.target.files[0], i)} />
                      {photo.src
                        ? <img src={photo.src} alt="preview" className="h-16 w-16 rounded-xl object-cover" />
                        : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/60 text-xs text-slate-400">Preview</div>
                      }
                    </div>
                  </div>
                ))}
                <PillButton onClick={addPhoto}>+ Add photo</PillButton>
                {hasEmbeddedImages && (
                  <p className="text-xs text-rose-500">Uploaded photos are browser-only. Use hosted URLs for sharing.</p>
                )}
              </div>

              {/* Music */}
              <SectionTitle icon={<Music2 />}>Music</SectionTitle>
              <div className="space-y-3">
                <StyledInput placeholder="Paste an audio URL or upload a file"
                  value={config.music.source}
                  onChange={(e) => setNested("music", { source: e.target.value })} />
                <input type="file" accept="audio/*"
                  onChange={(e) => handleAudioFile(e.target.files[0])} />
                {hasEmbeddedAudio && (
                  <p className="text-xs text-rose-500">Uploaded audio is local-only. Use a hosted mp3 for reliable sharing.</p>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">Volume</span>
                  <input type="range" min="0" max="1" step="0.05" value={config.music.volume}
                    onChange={(e) => setNested("music", { volume: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            {/* ── Right column ── */}
            <div className="space-y-6">

              {/* Love Letter */}
              <SectionTitle icon={<Stars />}>Love Letter</SectionTitle>
              <Field label="Short version">
                <textarea rows={3}
                  className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 outline-none"
                  value={config.shortLetter}
                  onChange={(e) => set("shortLetter", e.target.value)} />
              </Field>
              <Field label="Long version">
                <textarea rows={7}
                  className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 outline-none"
                  value={config.longLetter}
                  onChange={(e) => set("longLetter", e.target.value)} />
              </Field>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600">Default mode</span>
                <select className="rounded-full border border-white/70 bg-white/80 px-3 py-1"
                  value={config.letterMode}
                  onChange={(e) => set("letterMode", e.target.value)}>
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
              </div>

              {/* Timeline */}
              <SectionTitle icon={<Sparkles />}>Timeline</SectionTitle>
              <div className="space-y-3">
                {config.timeline.map((item, i) => (
                  <div key={i} className="rounded-2xl bg-white/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <StyledInput className="flex-1" value={item.title} placeholder="Title"
                        onChange={(e) => setTimeline(i, { title: e.target.value })} />
                      <input type="date"
                        className="rounded-full border border-white/60 bg-white/80 px-3 py-2"
                        value={item.date}
                        onChange={(e) => setTimeline(i, { date: e.target.value })} />
                      <StyledInput className="w-16 text-center" value={item.emoji}
                        onChange={(e) => setTimeline(i, { emoji: e.target.value })} />
                    </div>
                    <textarea rows={2}
                      className="w-full rounded-2xl border border-white/60 bg-white/80 px-3 py-2 outline-none"
                      value={item.description}
                      onChange={(e) => setTimeline(i, { description: e.target.value })} />
                    <button className="text-xs text-rose-500" onClick={() => removeTimeline(i)}>
                      Remove
                    </button>
                  </div>
                ))}
                <PillButton onClick={addTimelineItem}>+ Add moment</PillButton>
              </div>

              {/* Surprise */}
              <SectionTitle icon={<Lock />}>Surprise Unlock</SectionTitle>
              <div className="space-y-3">
                <select className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3"
                  value={config.surprise.unlock}
                  onChange={(e) => setNested("surprise", { unlock: e.target.value })}>
                  {UNLOCK_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {config.surprise.unlock === "time" && (
                  <StyledInput type="number" placeholder="Delay in seconds"
                    value={config.surprise.delaySeconds}
                    onChange={(e) => setNested("surprise", { delaySeconds: Number(e.target.value) })} />
                )}
                {config.surprise.unlock === "click" && (
                  <StyledInput type="number" placeholder="Clicks to unlock"
                    value={config.surprise.clickCount}
                    onChange={(e) => setNested("surprise", { clickCount: Number(e.target.value) })} />
                )}
              </div>

              {/* Theme */}
              <SectionTitle icon={<Palette />}>Theme</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                {PALETTES.map((p) => (
                  <button key={p.id}
                    className={`rounded-2xl border px-4 py-3 text-sm transition ${
                      config.theme.palette === p.id
                        ? "border-rose-400 bg-rose-50 font-medium"
                        : "border-white/70 bg-white/60 hover:bg-white/80"
                    }`}
                    onClick={() => setNested("theme", { palette: p.id })}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Sharing / Cloudinary */}
              <SectionTitle icon={<Link />}>Sharing</SectionTitle>
              <div className="rounded-2xl bg-white/70 p-4 space-y-4">
                <p className="text-sm text-slate-600">
                  For reliable share links, host your media on Cloudinary.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cloudinary cloud name">
                    <StyledInput value={cloudName} placeholder="your-cloud"
                      onChange={(e) => { setCloudName(e.target.value); localStorage.setItem("cloudinary-cloud", e.target.value); }} />
                  </Field>
                  <Field label="Upload preset">
                    <StyledInput value={uploadPreset} placeholder="your-preset"
                      onChange={(e) => { setUploadPreset(e.target.value); localStorage.setItem("cloudinary-preset", e.target.value); }} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-3">
                  <PillButton onClick={downloadJson}>Download JSON</PillButton>
                  <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/70 px-4 py-2 text-sm hover:bg-white/60 transition">
                    Import JSON
                    <input type="file" accept="application/json" className="hidden"
                      onChange={(e) => importJson(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <PillButton onClick={() => { clearConfig(); setConfig(defaultConfig); }}>Reset</PillButton>
              <PillButton onClick={() => saveConfig(config)}>
                <Save className="h-4 w-4" /> Save draft
              </PillButton>
            </div>
            <div className="flex flex-wrap gap-3">
              <PillButton onClick={handleShareLink}>
                <Link className="h-4 w-4" /> Copy share link
              </PillButton>
              <PillButton onClick={() => navigate("/anniversary")}>
                <Eye className="h-4 w-4" /> Preview
              </PillButton>
              <button
                className="flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-sm text-white shadow-glow hover:bg-rose-600 transition"
                onClick={saveAndPreview}>
                <Heart className="h-4 w-4" />
                {saving ? "Saving…" : "Generate Anniversary Experience"}
              </button>
            </div>
          </div>

          {shareMsg && (
            <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-600">
              {shareMsg}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
