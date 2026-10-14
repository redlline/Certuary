# -*- coding: utf-8 -*-
"""Коммерческое предложение: HPE ProLiant DL380 Gen10 -> PDF."""
import os
from fpdf import FPDF

FONT_DIR = r"C:\Windows\Fonts"
IMG = os.path.join(os.path.dirname(__file__), "dl380.png")
OUT = os.path.join(os.path.dirname(__file__), "KP_HPE_DL380_Gen10.pdf")

# Палитра
DARK = (31, 41, 55)
ACCENT = (1, 169, 130)      # HPE green
GREY = (107, 114, 128)
LIGHT = (243, 244, 246)


class KP(FPDF):
    def header(self):
        self.set_fill_color(*ACCENT)
        self.rect(0, 0, 210, 4, "F")

    def footer(self):
        self.set_y(-18)
        self.set_font("arial", "I", 8)
        self.set_text_color(*GREY)
        self.cell(0, 5, "Коммерческое предложение | HPE ProLiant DL380 Gen10", align="C")
        self.ln(4)
        self.cell(0, 5, f"Стр. {self.page_no()}/{{nb}}", align="C")


pdf = KP("P", "mm", "A4")
pdf.alias_nb_pages()
pdf.set_auto_page_break(True, 25)
pdf.set_margins(18, 15, 18)

for style, fname in (("", "arial.ttf"), ("B", "arialbd.ttf"),
                     ("I", "ariali.ttf"), ("BI", "arialbi.ttf")):
    pdf.add_font("arial", style, os.path.join(FONT_DIR, fname))

pdf.add_page()

# --- Заголовок ---
pdf.set_font("arial", "B", 22)
pdf.set_text_color(*DARK)
pdf.cell(0, 10, "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("arial", "", 10)
pdf.set_text_color(*GREY)
pdf.cell(0, 6, "от 07.10.2026", new_x="LMARGIN", new_y="NEXT")
pdf.ln(4)

# --- Наименование ---
pdf.set_font("arial", "B", 15)
pdf.set_text_color(*DARK)
pdf.cell(0, 9, "Сервер HPE ProLiant DL380 Gen10", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("arial", "", 10)
pdf.set_text_color(*GREY)
pdf.cell(0, 6, "2U rack server | Новое оборудование в оригинальной упаковке HP",
         new_x="LMARGIN", new_y="NEXT")
pdf.ln(6)

# --- Фото ---
img_w = 165
pdf.image(IMG, x=(210 - img_w) / 2, w=img_w)
pdf.ln(8)

# --- Конфигурация ---
def section(title):
    pdf.set_font("arial", "B", 12)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.5)
    pdf.line(pdf.l_margin, pdf.get_y(), 210 - pdf.r_margin, pdf.get_y())
    pdf.ln(3)

section("Конфигурация")
config = [
    ("Процессоры", "2 x Intel Xeon Gold (модель уточняется при необходимости)"),
    ("Оперативная память", "512 ГБ"),
    ("Накопители SSD", "2 x SSD 480 ГБ"),
    ("Накопители HDD", "6 x HDD SAS 1.2 ТБ"),
    ("Блоки питания", "2 x PSU (резервирование)"),
    ("Комплектация", "Комплект направляющих (rails kit), оригинальная упаковка HP"),
]
pdf.set_font("arial", "", 10.5)
for i, (k, v) in enumerate(config):
    if i % 2 == 0:
        pdf.set_fill_color(*LIGHT)
        fill = True
    else:
        fill = False
    pdf.set_font("arial", "B", 10.5)
    pdf.set_text_color(*DARK)
    pdf.cell(55, 8, "  " + k, border=0, fill=fill)
    pdf.set_font("arial", "", 10.5)
    pdf.cell(0, 8, "  " + v, border=0, fill=fill, new_x="LMARGIN", new_y="NEXT")
pdf.ln(6)

# --- Цена ---
pdf.set_fill_color(*DARK)
pdf.set_text_color(255, 255, 255)
pdf.set_font("arial", "B", 12)
pdf.cell(90, 14, "  Цена", fill=True)
pdf.set_font("arial", "B", 16)
pdf.cell(0, 14, "6 420 USD  ", fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
pdf.ln(8)

# --- Условия поставки ---
section("Условия поставки")
terms = [
    ("Предоплата", "50%"),
    ("Срок поставки", "7–12 дней с момента подтверждения заказа"),
]
for i, (k, v) in enumerate(terms):
    fill = i % 2 == 0
    if fill:
        pdf.set_fill_color(*LIGHT)
    pdf.set_font("arial", "B", 10.5)
    pdf.set_text_color(*DARK)
    pdf.cell(55, 8, "  " + k, fill=fill)
    pdf.set_font("arial", "", 10.5)
    pdf.cell(0, 8, "  " + v, fill=fill, new_x="LMARGIN", new_y="NEXT")
pdf.ln(6)

# --- Дополнительно ---
section("Дополнительно")
pdf.set_font("arial", "", 10.5)
pdf.set_text_color(*DARK)
pdf.multi_cell(0, 6,
    "Возможна установка дополнительных комплектующих или ПО по вашему запросу. "
    "Стоимость и сроки согласовываются отдельно.")
pdf.ln(6)

pdf.set_font("arial", "I", 9)
pdf.set_text_color(*GREY)
pdf.multi_cell(0, 5,
    "Изображение носит иллюстративный характер и может отличаться от фактической "
    "комплектации. Предложение действительно в течение 14 календарных дней.")

pdf.output(OUT)
print("OK:", OUT)
