const $ = id => document.getElementById(id);
const state = { source: null, subject: null, bg: null, mode: "transparent", color: "#ffffff", gradient: ["#dbeafe", "#ede9fe"], format: "png" };
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const start = $("start");
const editor = $("tool");
const loader = $("loader");

async function optimize(file) {
  $("progressText").textContent = "Preparing image…";
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 12 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const temp = document.createElement("canvas");
  temp.width = Math.max(1, Math.round(bitmap.width * scale));
  temp.height = Math.max(1, Math.round(bitmap.height * scale));
  temp.getContext("2d").drawImage(bitmap, 0, 0, temp.width, temp.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => temp.toBlob(value => value ? resolve(value) : reject(new Error("Optimization failed")), "image/jpeg", .9));
  return new File([blob], "optimized.jpg", { type: "image/jpeg" });
}

async function openFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 100 * 1024 * 1024) return alert("Please choose an image under 100 MB.");
  state.source = URL.createObjectURL(file);
  state.subject = null;
  $("fileName").textContent = file.name;
  start.classList.add("hidden");
  editor.classList.remove("hidden");
  loader.classList.remove("hidden");
  $("statusText").textContent = "Processing image…";
  $("download").disabled = true;
  await draw(state.source);
  try {
    const input = await optimize(file);
    $("progressText").textContent = "Loading fast AI model…";
    const { removeBackground } = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm");
    const result = await removeBackground(input, {
      model: "isnet_quint8",
      device: "gpu" in navigator ? "gpu" : "cpu",
      output: { format: "image/png", quality: .9 },
      progress: (_key, done, total) => {
        const percent = total > 0 ? Math.min(80, Math.round((done / total) * 80)) : 10;
        $("progressText").textContent = percent < 80 ? `Downloading AI ${percent}%` : "AI is separating the subject…";
      }
    });
    $("progressText").textContent = "Finishing image… 95%";
    state.subject = URL.createObjectURL(result);
    await draw(state.subject);
    $("progressText").textContent = "Complete 100%";
    $("statusText").textContent = "Background removed";
    $("download").disabled = false;
    setTimeout(() => loader.classList.add("hidden"), 250);
  } catch (error) {
    console.error(error);
    $("progressText").textContent = "Could not process this image. Try a smaller JPG, PNG or WebP.";
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
}

async function draw(url = state.subject || state.source) {
  if (!url) return;
  const person = await loadImage(url);
  const scale = Math.min(1, 1600 / Math.max(person.naturalWidth, person.naturalHeight));
  canvas.width = Math.round(person.naturalWidth * scale);
  canvas.height = Math.round(person.naturalHeight * scale);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.mode === "color") { ctx.fillStyle = state.color; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (state.mode === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, state.gradient[0]); gradient.addColorStop(1, state.gradient[1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (state.mode === "image" && state.bg) {
    const bg = await loadImage(state.bg);
    const fit = Math.max(canvas.width / bg.width, canvas.height / bg.height);
    const width = bg.width * fit, height = bg.height * fit;
    ctx.drawImage(bg, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  ctx.filter = `brightness(${$("brightness").value}%) contrast(${$("contrast").value}%) saturate(${$("saturation").value}%)`;
  ctx.drawImage(person, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";
}

$("fileInput").onchange = event => openFile(event.target.files[0]);
const zone = $("dropZone");
zone.ondragover = event => { event.preventDefault(); zone.classList.add("drag"); };
zone.ondragleave = () => zone.classList.remove("drag");
zone.ondrop = event => { event.preventDefault(); zone.classList.remove("drag"); openFile(event.dataTransfer.files[0]); };

document.querySelectorAll(".mode").forEach(button => button.onclick = () => {
  document.querySelectorAll(".mode").forEach(item => item.classList.remove("active"));
  button.classList.add("active"); state.mode = button.dataset.mode;
  ["color", "gradient", "image"].forEach(name => $(`${name}Panel`).classList.toggle("hidden", name !== state.mode));
  if (state.mode === "transparent") { state.format = "png"; setFormat(); }
  draw();
});

$("colorInput").oninput = event => { state.color = event.target.value; draw(); };
document.querySelectorAll("[data-gradient]").forEach(button => button.onclick = () => { state.gradient = button.dataset.gradient.split(","); draw(); });
$("backgroundInput").onchange = event => { if (event.target.files[0]) { state.bg = URL.createObjectURL(event.target.files[0]); draw(); } };
["brightness", "contrast", "saturation"].forEach(id => $(id).oninput = event => { $(`${id}Value`).textContent = `${event.target.value}%`; draw(); });
$("reset").onclick = () => { ["brightness", "contrast", "saturation"].forEach(id => { $(id).value = 100; $(`${id}Value`).textContent = "100%"; }); draw(); };
function setFormat() { document.querySelectorAll("[data-format]").forEach(button => button.classList.toggle("active", button.dataset.format === state.format)); }
document.querySelectorAll("[data-format]").forEach(button => button.onclick = () => { if (state.mode === "transparent" && button.dataset.format === "jpeg") return alert("Transparent images must be PNG."); state.format = button.dataset.format; setFormat(); });
$("download").onclick = () => { const type = state.mode === "transparent" ? "png" : state.format; const link = document.createElement("a"); link.download = `picclear-result.${type === "jpeg" ? "jpg" : "png"}`; link.href = canvas.toDataURL(`image/${type}`, .94); link.click(); };
$("newImage").onclick = () => location.reload();
