// Cloudflare Worker — proxy AI cho "Xưởng Bán Hàng"
// -----------------------------------------------------
// Việc worker này làm: nhận yêu cầu từ app (trình duyệt), chuyển tiếp sang
// DeepSeek kèm API Key (giấu ở server, không lộ ra trình duyệt), rồi trả kết
// quả về — qua đó tránh lỗi CORS khi app tĩnh gọi thẳng API AI.
//
// CÁCH DÙNG:
// 1) Tạo Worker mới trên Cloudflare (Workers & Pages > Create > Create Worker),
//    dán toàn bộ file này vào, bấm Deploy.
// 2) Vào Settings của Worker > Variables and Secrets, thêm 2 biến (đánh dấu "Encrypt"):
//      DEEPSEEK_API_KEY = API key lấy từ platform.deepseek.com
//      AUTH_TOKEN        = một chuỗi bí mật bạn tự đặt (để chặn người khác gọi trộm)
// 3) Copy URL của Worker (dạng https://ten-worker.ten-subdomain.workers.dev),
//    dán vào app: mục "Cài đặt AI" > Proxy URL, và AUTH_TOKEN vào ô Access Token.

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Kiểm tra nhanh worker còn sống — mở URL bằng trình duyệt sẽ thấy {"status":"ok"}
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Xác thực bằng AUTH_TOKEN, không cho ai gọi trộm proxy
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!env.AUTH_TOKEN || token !== env.AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: "Worker chưa cấu hình DEEPSEEK_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const upstream = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + env.DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
          model: body.model || "deepseek-chat",
          messages: body.messages,
          max_tokens: body.max_tokens || 800,
          temperature: body.temperature != null ? body.temperature : 0.7
        })
      });

      const data = await upstream.text();
      return new Response(data, {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Gọi DeepSeek thất bại: " + err.message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
