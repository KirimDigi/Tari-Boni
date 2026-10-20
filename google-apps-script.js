/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - BUKU TAMU & RSVP (TARI & BONI)
 * ============================================================================
 * Spreadsheet ID: 1fceprLuTruK8KXASOVs92I1qAZ2Qe5RPlC__eoP8VhU
 * Sheet Name    : Sheet1
 * Kolom         : 1. Timestamp | 2. Nama Tamu | 3. Ucapan | 4. Konfirmasi Kehadiran | 5. Jumlah Tamu
 * 
 * CARA DEPLOY:
 * 1. Buka spreadsheet: https://docs.google.com/spreadsheets/d/1fceprLuTruK8KXASOVs92I1qAZ2Qe5RPlC__eoP8VhU/edit
 * 2. Klik menu 'Extensions' (Ekstensi) > 'Apps Script'.
 * 3. Hapus semua kode bawaan, lalu paste (tempel) seluruh kode di file ini.
 * 4. Klik ikon Save (Simpan).
 * 5. Klik tombol 'Deploy' (Terapkan) berwarna biru di kanan atas > 'New deployment' (Penerapan baru).
 * 6. Klik ikon gerigi (Settings) di sebelah kiri 'Select type', pilih 'Web app'.
 * 7. Konfigurasi:
 *    - Description: RSVP Tari & Boni
 *    - Execute as  : Me (email Anda)
 *    - Who has access: Anyone (Siapa saja)  <-- PENTING! Agar tamu bisa kirim & baca ucapan
 * 8. Klik 'Deploy'. Berikan izin otorisasi (Authorize access / Izinkan akses akun Google).
 * 9. Salin 'Web app URL' yang muncul (berakhiran /exec).
 * 10. Masukkan Web app URL tersebut ke dalam file index.html pada variabel GOOGLE_SCRIPT_URL.
 * ============================================================================
 */

const SPREADSHEET_ID = "1fceprLuTruK8KXASOVs92I1qAZ2Qe5RPlC__eoP8VhU";
const SHEET_NAME = "Sheet1";

/**
 * Helper untuk mengambil sheet dan inisialisasi header kolom jika sheet masih kosong
 */
function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  
  // Jika sheet kosong, buat header otomatis
  if (sheet.getLastRow() === 0) {
    const headers = ["Timestamp", "Nama Tamu", "Ucapan", "Konfirmasi Kehadiran", "Jumlah Tamu"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E5C494");
  }
  
  return sheet;
}

/**
 * Handle GET Request: Mengambil daftar ucapan dari Google Sheets untuk ditampilkan di web
 */
function doGet(e) {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    
    // Jika hanya ada header atau kosong
    if (lastRow <= 1) {
      return createJsonResponse({
        status: "success",
        total: 0,
        data: []
      });
    }
    
    // Ambil data dari baris ke-2 sampai baris terakhir, 5 kolom
    const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const list = [];
    
    // Format tiap baris menjadi objek ucapan (Urutan terbaru di atas)
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rawTimestamp = row[0];
      let formattedTime = "";
      
      if (rawTimestamp instanceof Date) {
        formattedTime = Utilities.formatDate(rawTimestamp, "Asia/Jakarta", "dd/MM/yyyy HH:mm");
      } else {
        formattedTime = String(rawTimestamp || "");
      }
      
      const nama = String(row[1] || "").trim();
      const ucapan = String(row[2] || "").trim();
      const kehadiran = String(row[3] || "").trim();
      const jumlah = String(row[4] || "").trim();
      
      // Hanya masukkan jika ada nama atau ucapan
      if (nama || ucapan) {
        list.push({
          timestamp: formattedTime,
          nama: nama,
          ucapan: ucapan,
          kehadiran: kehadiran,
          jumlah: jumlah
        });
      }
    }
    
    return createJsonResponse({
      status: "success",
      total: list.length,
      data: list
    });
    
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Handle POST Request: Menyimpan ucapan & RSVP baru ke Google Sheets
 */
function doPost(e) {
  // Gunakan LockService untuk mencegah konflik jika ada beberapa tamu submit bersamaan
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Tunggu maksimal 10 detik
  } catch (e) {
    return createJsonResponse({
      status: "error",
      message: "Server sedang sibuk, silakan coba kirim kembali dalam beberapa detik."
    });
  }
  
  try {
    let params = {};
    
    // Parsing data baik form-urlencoded maupun JSON payload
    if (e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        params = e.parameter || {};
      }
    } else {
      params = e.parameter || {};
    }
    
    const nama = (params.nama || params.author || "").toString().trim();
    const ucapan = (params.ucapan || params.comment || "").toString().trim();
    let kehadiran = (params.kehadiran || params.attendance || "").toString().trim();
    let jumlah = (params.jumlah || params.guest || "").toString().trim();
    
    // Standarisasi nilai konfirmasi kehadiran
    if (kehadiran === "present" || kehadiran.toLowerCase() === "hadir") {
      kehadiran = "Hadir";
    } else if (kehadiran === "notpresent" || kehadiran.toLowerCase() === "tidak hadir") {
      kehadiran = "Tidak Hadir";
      jumlah = "-"; // Auto hide & strip jumlah jika tidak hadir
    } else if (kehadiran === "notsure" || kehadiran.toLowerCase() === "masih ragu") {
      kehadiran = "Masih Ragu";
      jumlah = "-";
    }
    
    // Standarisasi teks jumlah tamu
    if (jumlah && jumlah !== "-" && !jumlah.toLowerCase().includes("orang")) {
      jumlah = jumlah + " orang";
    }
    
    // Validasi minimal nama dan ucapan
    if (!nama || !ucapan) {
      return createJsonResponse({
        status: "error",
        message: "Nama dan ucapan tidak boleh kosong."
      });
    }
    
    // Buat timestamp waktu Indonesia (WIB)
    const timestamp = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss");
    
    const sheet = getSheet();
    const newRow = [timestamp, nama, ucapan, kehadiran, jumlah];
    sheet.appendRow(newRow);
    
    return createJsonResponse({
      status: "success",
      message: "Terima kasih! Ucapan & konfirmasi kehadiran Anda berhasil disimpan.",
      data: {
        timestamp: timestamp,
        nama: nama,
        ucapan: ucapan,
        kehadiran: kehadiran,
        jumlah: jumlah
      }
    });
    
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Helper JSON Response dengan CORS
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
