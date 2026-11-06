# TrendX Trading Office

เว็บแสดงผลบัญชี TrendX หลายบัญชี ใช้ Next.js บน Vercel และ PostgreSQL

```text
EA V.1.39.1 -> ไฟล์สถานะ model -> TrendX Cloud Bridge (MT5 Service) -> /api/ingest -> PostgreSQL -> เว็บ
```

EA ไม่ได้ส่งเน็ตเอง เพราะ `WebRequest` จะบล็อกการทำงานและทำให้การตรวจ virtual SL/TP ช้า Service จึงเป็นตัวส่งข้อมูลแทน Service อ่านข้อมูลบัญชีอย่างเดียว ไม่เปิดหรือปิดไม้

## 1. สร้างฐานข้อมูล

สร้าง PostgreSQL ที่ [Neon](https://neon.com) หรือ Supabase แล้วคัดลอก connection string

```bash
cd trendx_trading_office
npm install
DATABASE_URL="postgres://..." npm run db:migrate
```

## 2. Deploy บน Vercel

Import โฟลเดอร์ `trendx_trading_office` เป็นโปรเจกต์ใน Vercel แล้วตั้ง Environment Variables ตาม `.env.example`

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | connection string ของ PostgreSQL |
| `INGEST_API_KEY` | ข้อความสุ่มยาวๆ ใช้เป็น `Cloud_Key` ของ Service |
| `SESSION_SECRET` | ข้อความสุ่มยาวๆ อีกชุด |

## 3. ตั้งค่า MT5 (ทำทุกบัญชี)

1. ติด `TrendX Ultimate AI Pro V.1.39.1` บนกราฟ XAUUSD H1
2. ไปที่ Tools > Options > Expert Advisors เปิด Allow WebRequest แล้วเพิ่ม URL เว็บ เช่น `https://your-app.vercel.app`
3. ในหน้าต่าง Navigator ที่ Services คลิกขวา `TrendX Cloud Bridge` เลือก Add Service
4. ตั้ง `Cloud_URL` เป็น `https://your-app.vercel.app/api/ingest` และ `Cloud_Key` เป็นค่า `INGEST_API_KEY`
5. ถ้าเปลี่ยน `Magic` ของ EA ให้ตั้ง `Magic_Base` เป็นค่าเดียวกัน

บัญชีจะถูกเพิ่มในเว็บอัตโนมัติเมื่อส่งข้อมูลครั้งแรก ไม่ต้องสร้างเอง

## ข้อควรรู้

- ส่งเฉพาะไม้ที่ magic อยู่ในช่วง `Magic_Base*1000` ถึง `+999` และรายการฝากถอน
- ถ้าเน็ตหลุด Service จะส่งรายการค้างเมื่อกลับมาออนไลน์ และฐานข้อมูลกันรายการซ้ำด้วยเลข ticket
- Max Drawdown บนเว็บนับตั้งแต่เชื่อมต่อเท่านั้น เพราะ MT5 ไม่ได้เก็บ equity ย้อนหลัง
- เวลาบนเว็บเป็นเวลา server ของโบรก ตรงกับใน MT5
