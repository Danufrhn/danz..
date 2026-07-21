import streamlit as st

st.set_page_config(page_title="Kalkulator HPP", page_icon="🧮", layout="centered")

st.title("🧮 Kalkulator HPP (Harga Pokok Penjualan)")
st.caption("Hitung HPP per produk dengan komponen: harga modal, biaya Shopee, packaging, dan biaya operasional")

st.divider()

# ============================
# 1. HARGA MODAL
# ============================
st.subheader("1️⃣ Harga Modal")
harga_modal = st.number_input(
    "Harga modal / bahan baku per produk (Rp)",
    min_value=0.0, value=0.0, step=500.0, format="%.0f"
)

# ============================
# 2. PACKAGING
# ============================
st.subheader("2️⃣ Biaya Packaging")
biaya_packaging = st.number_input(
    "Biaya packaging per produk (Rp)",
    min_value=0.0, value=0.0, step=500.0, format="%.0f"
)

# ============================
# 3. BIAYA SHOPEE
# ============================
st.subheader("3️⃣ Biaya Shopee")
st.caption("Biasanya berupa persentase dari harga jual (biaya admin, layanan, iklan, dll)")

harga_jual = st.number_input(
    "Rencana harga jual produk (Rp) — dipakai untuk hitung biaya Shopee",
    min_value=0.0, value=0.0, step=500.0, format="%.0f"
)

persen_shopee = st.number_input(
    "Total biaya Shopee (%) — misal: biaya admin + layanan + iklan",
    min_value=0.0, max_value=100.0, value=8.0, step=0.5
)
biaya_shopee = harga_jual * (persen_shopee / 100)

# ============================
# 4. BIAYA OPERASIONAL
# ============================
st.subheader("4️⃣ Biaya Operasional")
st.caption("Total biaya operasional per bulan (gaji, listrik, bensin, dll dijumlah sendiri), nanti dibagi dengan jumlah produk terjual per bulan")

total_operasional_bulanan = st.number_input(
    "Total biaya operasional per bulan (Rp)",
    min_value=0.0, value=0.0, step=50000.0, format="%.0f"
)

jumlah_produk_bulanan = st.number_input(
    "Estimasi jumlah produk terjual per bulan (pcs)",
    min_value=1, value=100, step=1
)

biaya_operasional_per_unit = total_operasional_bulanan / jumlah_produk_bulanan if jumlah_produk_bulanan > 0 else 0

st.divider()

# ============================
# HITUNG HPP
# ============================
hpp = harga_modal + biaya_packaging + biaya_shopee + biaya_operasional_per_unit

st.subheader("📊 Hasil Perhitungan")

rincian = {
    "Harga Modal": harga_modal,
    "Biaya Packaging": biaya_packaging,
    "Biaya Shopee": biaya_shopee,
    "Biaya Operasional per Unit": biaya_operasional_per_unit,
}

for label, nilai in rincian.items():
    st.write(f"- {label}: **Rp {nilai:,.0f}**".replace(",", "."))

st.metric("💰 Total HPP per Produk", f"Rp {hpp:,.0f}".replace(",", "."))

# ============================
# ANALISA HARGA JUAL & MARGIN
# ============================
st.divider()
st.subheader("📈 Analisa Margin (opsional)")

if harga_jual > 0:
    laba = harga_jual - hpp
    margin_persen = (laba / harga_jual * 100) if harga_jual > 0 else 0

    colA, colB = st.columns(2)
    colA.metric("Laba per Produk", f"Rp {laba:,.0f}".replace(",", "."))
    colB.metric("Margin (%)", f"{margin_persen:.1f}%")

    if laba < 0:
        st.error("⚠️ Harga jual masih di bawah HPP, kamu rugi di harga ini!")
    elif margin_persen < 10:
        st.warning("Margin masih tipis, pertimbangkan naikkan harga jual atau efisiensi biaya.")
    else:
        st.success("Margin cukup sehat 👍")
else:
    st.info("Isi 'Rencana harga jual produk' di atas untuk melihat estimasi laba & margin.")

st.divider()
target_margin = st.number_input("Target margin keuntungan (%)", min_value=0.0, value=20.0, step=1.0)
harga_jual_disarankan = hpp / (1 - target_margin / 100) if target_margin < 100 else 0
st.write(f"Rekomendasi harga jual untuk margin {target_margin:.0f}%: "
         f"**Rp {harga_jual_disarankan:,.0f}**".replace(",", "."))
