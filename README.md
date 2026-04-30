# CBR-Mobile

**Aplikasi Perhitungan California Bearing Ratio dari Uji Dynamic Cone Penetrometer**
PT Putra Perkasa Abadi · Jobsite PT Bukit Asam Tbk · Geotechnology & Development Engineer

---

## Fitur Utama

1. **Perhitungan CBR otomatis** dari data Uji DCP lapangan menggunakan korelasi Webster (1992):
   - Konus 60°: `log CBR = 2.8135 - 1.313 × log DCP`
   - Konus 30°: `log CBR = 1.352 - 1.125 × log(DCP/10)`
2. **Riwayat perhitungan** tersimpan otomatis di perangkat
3. **Export PDF** dengan format laporan resmi (kop Bukit Asam + PPA, tabel pengujian, dan grafik Hubungan Kumulatif Tumbukan vs Penetrasi)
4. **Pengaturan acuan CBR** yang dapat dikonfigurasi (Rata-rata Acuan, Range Min Acuan, Faktor q Ultimate)
5. **PWA installable** — bekerja offline di Android setelah diinstall
6. **Auto-save draft** sehingga data tidak hilang saat aplikasi ditutup
7. **Status compliance** otomatis (Sesuai / Tidak Sesuai Acuan Geoteknik)
8. **Perhitungan q Ultimate** (kPa) berdasarkan faktor konversi (default 6.9 × CBR%)

## Cara Deploy & Install ke Android

### Pilihan 1 — Deploy ke GitHub Pages (Disarankan)

1. Buat repository baru di GitHub (contoh: `cbr-mobile`)
2. Upload semua file di folder ini ke repository
3. Buka Settings → Pages → Source: pilih branch `main`, folder `/ (root)` → Save
4. Tunggu 1-2 menit hingga GitHub Pages aktif (cek di tab Actions)
5. Buka URL `https://username.github.io/cbr-mobile/` di browser Android (Chrome)
6. Tap menu **⋮** → **Install app** atau **Add to Home Screen**
7. Aplikasi akan terinstall sebagai aplikasi standalone di home screen

### Pilihan 2 — Deploy ke Netlify Drop (Tercepat)

1. Buka https://app.netlify.com/drop
2. Drag-drop seluruh folder `cbr-mobile` ke halaman Netlify
3. Salin URL yang diberikan (contoh: `https://cbr-mobile-xxx.netlify.app`)
4. Buka URL di Chrome Android, lalu Install seperti langkah di atas

### Pilihan 3 — Local Server (untuk testing)

```bash
# Jika punya Python
cd cbr-mobile
python3 -m http.server 8080

# Atau dengan Node.js
npx serve cbr-mobile -p 8080
```

Lalu buka `http://<IP-laptop>:8080` dari Android di jaringan WiFi yang sama.

## Cara Penggunaan

### 1. Memasukkan Data Pengujian

1. Buka tab **Uji Baru**
2. Isi informasi titik uji (Lokasi, Easting, Northing, Tanggal, dsb)
3. Pada tabel **Data Pengujian DCP**:
   - Baris #0 (oranye): isi **Pembacaan Awal** (Kumulatif Penetrasi awal, mm)
   - Tap **Tambah Baris Pengujian** untuk setiap interval (default 10 tumbukan)
   - Isi **Tumbukan** (jumlah pukulan per interval) dan **Kumulatif Penetrasi** (pembacaan mistar saat itu, mm)
   - DCP, CBR, dan status akan terhitung otomatis per baris

### 2. Melihat & Export Hasil

1. Setelah data lengkap, tap **Lihat Hasil** atau buka tab **Hasil**
2. Akan ditampilkan: Status compliance, Rata-rata CBR/DCP, CBR Min, q Ultimate, grafik, dan tabel lengkap
3. Tap **Simpan Riwayat** untuk menyimpan ke perangkat
4. Tap **Export PDF** untuk menghasilkan laporan PDF dengan format resmi

### 3. Mengatur Acuan CBR

Buka tab **Pengaturan**:
- **Rata-Rata Acuan**: nilai minimum rata-rata CBR (default 21.60%)
- **Range Min Acuan**: nilai minimum CBR per layer (default 16.40%)
- **Faktor q Ultimate**: pengali untuk konversi CBR ke kPa (default 6.9)

Status compliance dihitung dengan kriteria:
- ✅ **Sesuai**: Avg CBR ≥ Rata-Rata Acuan **DAN** semua CBR per layer ≥ Range Min Acuan
- ❌ **Tidak Sesuai**: salah satu kriteria di atas tidak terpenuhi

## Verifikasi Perhitungan

Aplikasi telah diverifikasi terhadap data Laporan Geoteknik **PPA-BA-F-ENG-40B** April 2026:

| Titik | DCP Avg (mm/pen) | CBR Avg (%) | q Ult (kPa) | Status |
|-------|------------------|-------------|-------------|--------|
| RL+32 #1 | 12.98 | 22.64 | 156.24 | Sesuai |
| RL+44 #1 | 11.32 | 26.91 | 185.71 | Sesuai |
| RL+72 #1 | 13.30 | 21.80 | 150.41 | Sesuai |

Untuk verifikasi langsung di aplikasi, tap **Muat Data Contoh (RL+32 #1)** pada tab Uji Baru.

## Struktur File

```
cbr-mobile/
├── index.html              # Aplikasi utama (UI + struktur)
├── app.js                  # Semua logika perhitungan, state, PDF
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline support)
├── icon-192.png            # PWA icon (Android)
├── icon-512.png            # PWA icon (high-res)
├── icon-maskable-512.png   # PWA maskable icon
├── apple-touch-icon.png    # iOS home screen icon
└── README.md               # Dokumentasi ini
```

## Referensi Teknis

- **Webster, S. L., Grau, R. H., Williams, T. P.** (1992). *Description and Application of Dual Mass Dynamic Cone Penetrometer*, Report GL-92-3, Department of the Army, Washington, DC.
- **Kementerian Pekerjaan Umum** (2010). *Pemberlakuan Pedoman Cara Uji California Bearing Ratio (CBR) dengan Dynamic Cone Penetrometer (DCP)*. Jakarta.

## Lisensi & Kontak

Dibuat untuk internal use PT Putra Perkasa Abadi - Jobsite PT Bukit Asam Tbk.
Geotechnology & Development Engineer · Department Engineering · Tanjung Enim, 2026.

---
**v1.0.0** · Build 2026.04
