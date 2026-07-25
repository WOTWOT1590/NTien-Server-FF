/**
 * GIAO THỨC CHUYÊN GIA - TOUCHCORE-X SECURE SERVER (RENDER.COM)
 * Chủ quyền mã nguồn: N.Tiến Regedit
 */

const express = require('express');
const storage = require('node-persist');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Khởi tạo Database lưu trữ nội bộ trên Server (Không sợ mất dữ liệu)
async function initDB() {
    await storage.init({ dir: 'database_storage' });
}
initDB();

const MASTER_KEY = "NMTDEPZAICIUTO11";

// =========================================================================
// 1. API NHẬN UDID TỪ IPHONE VÀ TRẢ VỀ FILE AIMLOCK ĐƯỢC CHỌN
// =========================================================================
app.post('/api/enroll', async (req, res) => {
    const rawBody = req.body ? JSON.stringify(req.body) : "";
    let udid = "", model = "iPhone Unknown";

    // Đọc thông tin phần cứng iPhone gửi lên
    const reqString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    // (Bắt UDID qua regex chuẩn iOS Profile Service)
    const matchUdid = reqString.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/i);
    if (matchUdid) udid = matchUdid[1].trim();

    const matchModel = reqString.match(/<key>PRODUCT<\/key>\s*<string>([^<]+)<\/string>/i);
    if (matchModel) model = "iPhone " + matchModel[1].replace("iPhone", "").split(",")[0];

    // Lấy IP của khách
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "127.0.0.1";

    if (!udid) {
        return res.status(400).send("Invalid Device UDID");
    }

    // Kiểm tra xem khách đã có trong hệ thống chưa
    let user = await storage.getItem(udid);

    if (!user) {
        // NẾU CHƯA CÓ: Lưu vào hàng đợi "Chờ duyệt" (Pending)
        await storage.setItem(`pending_${udid}`, {
            udid,
            model: model || "iPhone",
            ip: clientIp,
            time: new Date().toLocaleString('vi-VN')
        });

        // Trả về file báo lỗi chưa kích hoạt cho iPhone
        res.setHeader('Content-Type', 'application/x-apple-aspen-config');
        res.setHeader('Content-Disposition', 'attachment; filename="ERROR_CHUA_KICH_HOAT.mobileconfig"');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array/>
	<key>PayloadDescription</key>
	<string>Mã UDID [${udid}] chưa được N.Tiến cấp phép! Vui lòng liên hệ Admin để thanh toán.</string>
	<key>PayloadDisplayName</key>
	<string>⛔ LỖI: CHƯA KÍCH HOẠT VIP</string>
	<key>PayloadIdentifier</key>
	<string>com.ntien.error</string>
	<key>PayloadOrganization</key>
	<string>N.Tiến Regedit</string>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>00000000-0000-0000-0000-000000000000</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>`);
    }

    // NẾU ĐÃ ĐƯỢC DUYỆT: Lấy nội dung file .mobileconfig tùy biến mà Admin đã chọn cho khách này
    let customMobileConfig = user.customConfig || getDefaultConfig(udid, user.model);

    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', `attachment; filename="TOUCHCORE-X_VIP_${udid}.mobileconfig"`);
    return res.send(customMobileConfig);
});

// =========================================================================
// 2. GIAO DIỆN QUẢN LÝ ADMIN (ĐƯỢC BẢO VỆ BẰNG KEY - KHÔNG LỘ CODE KHI F12)
// =========================================================================
app.get('/admin', async (req, res) => {
    const key = req.query.key;
    if (key !== MASTER_KEY) {
        return res.status(403).send(`
            <body style="background:#0a0f1d;color:#ff0033;font-family:monospace;text-align:center;padding-top:100px;">
                <h1>⛔ TRUY CẬP BỊ TỪ CHỐI</h1>
                <p>Bạn phải truyền đúng khóa bảo mật trên URL (Ví dụ: /admin?key=NMTDEPZAICIUTO11)</p>
            </body>
        `);
    }

    // Lấy danh sách VIP và Pending từ bộ nhớ Server
    const keys = await storage.keys();
    let vips = [];
    let pendings = [];

    for (let k of keys) {
        if (k.startsWith('pending_')) {
            pendings.push(await storage.getItem(k));
        } else if (k.length > 20 && !k.startsWith('config_')) {
            vips.push(await storage.getItem(k));
        }
    }

    // Trả về giao diện Admin hoàn toàn tối ưu (Server-rendered, khách F12 không thấy cấu hình thầm lặng)
    res.send(`<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
    <meta charset="UTF-8">
    <title>TOUCHCORE-X | ADMIN SECURE PANEL</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0a0f1d] text-gray-100 font-mono p-6">
    <header class="border-b border-emerald-500/30 pb-4 mb-6 flex justify-between items-center">
        <div>
            <h1 class="text-xl font-bold text-emerald-400">⚡ TOUCHCORE-X SECURE ADMIN</h1>
            <p class="text-xs text-gray-400">CHỦ QUYỀN: N.TIẾN REGEDIT | API MODE ACTIVE</p>
        </div>
        <a href="/admin?key=${MASTER_KEY}" class="bg-emerald-500/20 border border-emerald-500 text-emerald-400 px-3 py-1 rounded text-xs">LÀM MỚI 🔄</a>
    </header>

    <!-- KHÁCH ĐANG CHỜ DUYỆT -->
    <div class="mb-8">
        <h2 class="text-md font-bold text-yellow-400 mb-2">🔔 KHÁCH VỪA CÀI MỒI (CHỜ DUYỆT)</h2>
        <div class="bg-gray-900/50 border border-yellow-500/30 rounded p-4">
            ${pendings.length === 0 ? '<p class="text-gray-500 text-xs">Không có ai đang chờ...</p>' : 
              pendings.map(p => `
                <div class="flex justify-between items-center border-b border-gray-800 py-2 text-xs">
                    <div><span class="text-yellow-300 font-mono">${p.udid}</span> | <span class="text-cyan-400">${p.model}</span> | IP: ${p.ip}</div>
                    <button onclick="approve('${p.udid}', '${p.model}')" class="bg-yellow-500 text-black px-3 py-1 rounded font-bold hover:bg-yellow-400">DUYỆT VIP ⚡</button>
                </div>`).join('')}
        </div>
    </div>

    <!-- DANH SÁCH VIP VÀ CẬP NHẬT FILE AIMLOCK -->
    <div>
        <h2 class="text-md font-bold text-emerald-400 mb-2">🛡️ QUẢN LÝ THIẾT BỊ VIP & CẬP NHẬT FILE AIMLOCK</h2>
        <div class="space-y-4">
            ${vips.length === 0 ? '<p class="text-gray-500 text-xs">Chưa có khách VIP nào...</p>' :
              vips.map(v => `
                <div class="bg-gray-900 border border-gray-800 rounded p-4 text-xs">
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <span class="text-white font-bold text-sm">${v.name}</span> 
                            <span class="text-gray-400 font-mono ml-2">[${v.udid}]</span>
                            <span class="text-cyan-400 ml-2">(${v.model})</span>
                        </div>
                        <button onclick="removeUser('${v.udid}')" class="bg-red-600 text-white px-2 py-1 rounded">XÓA / KHÓA</button>
                    </div>
                    
                    <!-- KHU VỰC CHỌN GÓI HOẶC NHẬP CODE THỦ CÔNG .MOBILECONFIG -->
                    <div class="mt-3 bg-black/50 p-3 rounded border border-gray-800">
                        <label class="text-gray-400 block mb-1 font-bold">Chọn gói có sẵn hoặc dán mã nguồn .mobileconfig tùy biến:</label>
                        <textarea id="config_${v.udid}" rows="3" class="w-full bg-black border border-gray-700 text-emerald-300 p-2 font-mono text-[11px] rounded mb-2">${v.customConfig || getDefaultConfig(v.udid, v.model)}</textarea>
                        <div class="flex gap-2">
                            <button onclick="updateConfig('${v.udid}')" class="bg-emerald-500 text-black font-bold px-4 py-1 rounded hover:bg-emerald-400">💾 CẬP NHẬT FILE CHO KHÁCH</button>
                            <span id="status_${v.udid}" class="text-yellow-400 self-center"></span>
                        </div>
                    </div>
                </div>`).join('')}
        </div>
    </div>

    <script>
        async function approve(udid, model) {
            const name = prompt("Nhập tên khách hàng (Zalo/FB):", "Khách VIP");
            if (!name) return;
            await fetch('/api/admin/save?key=${MASTER_KEY}', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ udid, name, model })
            });
            location.reload();
        }

        async function updateConfig(udid) {
            const customConfig = document.getElementById('config_' + udid).value;
            const res = await fetch('/api/admin/update-config?key=${MASTER_KEY}', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ udid, customConfig })
            });
            const json = await res.json();
            if(json.success) {
                document.getElementById('status_' + udid).innerText = "✅ ĐÃ CẬP NHẬT THÀNH CÔNG! Khách chỉ cần tải lại profile là nhận code mới.";
                setTimeout(() => document.getElementById('status_' + udid).innerText = "", 4000);
            }
        }

        async function removeUser(udid) {
            if(!confirm("Chắc chắn muốn xóa?")) return;
            await fetch('/api/admin/delete?key=${MASTER_KEY}', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ udid })
            });
            location.reload();
        }
    </script>
</body>
</html>`);
});

// =========================================================================
// 3. CÁC API HỆ THỐNG XỬ LÝ (ẨN TOÀN BỘ LOGIC KHỎI KHÁCH HÀNG)
// =========================================================================
app.post('/api/admin/save', async (req, res) => {
    if (req.query.key !== MASTER_KEY) return res.status(403).send("Unauthorized");
    const { udid, name, model } = req.body;
    await storage.setItem(udid, {
        udid, name, model,
        customConfig: getDefaultConfig(udid, model)
    });
    await storage.removeItem(`pending_${udid}`);
    res.json({ success: true });
});

app.post('/api/admin/update-config', async (req, res) => {
    if (req.query.key !== MASTER_KEY) return res.status(403).send("Unauthorized");
    const { udid, customConfig } = req.body;
    let user = await storage.getItem(udid);
    if (user) {
        user.customConfig = customConfig;
        await storage.setItem(udid, user);
    }
    res.json({ success: true });
});

app.post('/api/admin/delete', async (req, res) => {
    if (req.query.key !== MASTER_KEY) return res.status(403).send("Unauthorized");
    const { udid } = req.body;
    await storage.removeItem(udid);
    await storage.removeItem(`pending_${udid}`);
    res.json({ success: true });
});

// Hàm tạo cấu hình mặc định chuẩn XML Apple
function getDefaultConfig(udid, model) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>DNSSettings</key>
			<dict>
				<key>ServerAddresses</key>
				<array>
					<string>1.1.1.1</string>
					<string>8.8.8.8</string>
				</array>
				<key>SeverConfigruation</key>
				<dict>
					<key>TargetUDID</key>
					<string>${udid}</string>
					<key>EnableHeadLock</key>
					<true/>
					<key>AimSpeed</key>
					<integer>10</integer>
				</dict>
			</dict>
			<key>PayloadDisplayName</key>
			<string>TOUCHCORE-X (${model})</string>
			<key>PayloadIdentifier</key>
			<string>com.ntien.vip.${udid}</string>
			<key>PayloadType</key>
			<string>com.apple.dnsSettings.managed</string>
			<key>PayloadUUID</key>
			<string>F62C55E9-3D91-4C4A-AF24-9999CDEFED01</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>PayloadDescription</key>
	<string>Cấu hình tối ưu hóa riêng cho thiết bị ${model}. Bản quyền: N.Tiến.</string>
	<key>PayloadDisplayName</key>
	<string>TOUCHCORE-X VIP PRO</string>
	<key>PayloadIdentifier</key>
	<string>com.ntien.master.${udid}</string>
	<key>PayloadOrganization</key>
	<string>N.Tiến Regedit</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>3A8F8E10-A5D9-4D20-A3F5-F5A4E99563C8</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 N.Tiến Server running on port ${PORT}`));
