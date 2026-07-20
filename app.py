"""
WARCOK Streamlit App

Catatan:
Kode HTML yang Anda kirim cukup besar (800+ baris) dan tidak dapat
dikonversi penuh dalam satu respons ChatGPT. File ini adalah kerangka
Streamlit yang siap dikembangkan.
"""

import streamlit as st

st.set_page_config(page_title="WARCOK", layout="wide")

PRODUCTS = [
    {"name":"Kopi Sachet","price":2000,"emoji":"☕"},
    {"name":"Sampo Sachet","price":1500,"emoji":"🧴"},
    {"name":"Sabun Batang","price":6500,"emoji":"🧼"},
    {"name":"Snack Keripik","price":15000,"emoji":"🍟"},
]

if "cart" not in st.session_state:
    st.session_state.cart = {}

st.title("🛒 WARCOK — Warung Ucok 969")

page = st.sidebar.radio("Menu",["Home","Produk","Keranjang"])

if page=="Home":
    st.header("Selamat Datang")
    st.write("Belanja kebutuhan sehari-hari dengan praktis.")

elif page=="Produk":
    cols = st.columns(2)
    for i,p in enumerate(PRODUCTS):
        with cols[i%2]:
            st.subheader(f'{p["emoji"]} {p["name"]}')
            st.write(f'Harga: Rp {p["price"]:,}'.replace(",","."))
            q = st.number_input("Jumlah",1,20,1,key=p["name"])
            if st.button("Tambah",key="b"+p["name"]):
                st.session_state.cart[p["name"]] = st.session_state.cart.get(p["name"],0)+q
                st.success("Ditambahkan")

elif page=="Keranjang":
    total=0
    if not st.session_state.cart:
        st.info("Keranjang kosong.")
    else:
        for p in PRODUCTS:
            if p["name"] in st.session_state.cart:
                qty=st.session_state.cart[p["name"]]
                sub=qty*p["price"]
                total+=sub
                st.write(f'{p["name"]} x{qty} = Rp {sub:,}'.replace(",","."))
        st.metric("Total",f'Rp {total:,}'.replace(",","."))
        st.text_input("Nama")
        st.text_input("Alamat")
        st.text_input("No HP")
        st.button("Checkout")
