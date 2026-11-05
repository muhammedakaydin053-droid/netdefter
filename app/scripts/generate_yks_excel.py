#!/usr/bin/env python3
"""YKS Takip Sistemi — profesyonel .xlsx üretici (Excel + Google Sheets)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import SeriesLabel
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.styles import (
    Alignment,
    Border,
    Font,
    NamedStyle,
    PatternFill,
    Protection,
    Side,
)
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.workbook.protection import WorkbookProtection
from openpyxl.chart.legend import Legend
from openpyxl.chart.marker import Marker

sys.path.insert(0, str(Path(__file__).resolve().parent))
from yks_curriculum import flatten_topics, SUBJECT_ORDER  # noqa: E402

# --- Palette (sade, akademik) ---
INK = "1B3A4B"
INK_DEEP = "12262F"
TEAL = "2A6F7F"
TEAL_SOFT = "D7E4E6"
PAPER = "FFFDF8"
PAPER_ALT = "F4F0E8"
PAPER_MUTED = "EDE8DC"
LINE = "D4CFC6"
WHITE = "FFFFFF"
FG = "1C1917"
MUTED = "5C5854"
GREEN = "2F5D3A"
GREEN_BG = "D9E7D4"
AMBER = "6B5420"
AMBER_BG = "F0E2B8"
RED = "7A3030"
RED_BG = "F0D6D2"
GRAY = "5C5854"
GRAY_BG = "E8E6E1"
FORMULA_BG = "F3F0E9"
INPUT_BG = "FFFFFF"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
med_ink = Border(
    left=Side(style="medium", color=INK),
    right=Side(style="medium", color=INK),
    top=Side(style="medium", color=INK),
    bottom=Side(style="medium", color=INK),
)

font_title = Font(name="Calibri", size=20, bold=True, color=WHITE)
font_h = Font(name="Calibri", size=11, bold=True, color=WHITE)
font_h2 = Font(name="Calibri", size=13, bold=True, color=INK)
font_label = Font(name="Calibri", size=10, bold=True, color=MUTED)
font_body = Font(name="Calibri", size=10, color=FG)
font_formula = Font(name="Calibri", size=10, color=INK, italic=True)
font_kpi = Font(name="Calibri", size=18, bold=True, color=INK)
font_small = Font(name="Calibri", size=9, color=MUTED)

fill_ink = PatternFill("solid", fgColor=INK)
fill_teal = PatternFill("solid", fgColor=TEAL)
fill_paper = PatternFill("solid", fgColor=PAPER)
fill_alt = PatternFill("solid", fgColor=PAPER_ALT)
fill_muted = PatternFill("solid", fgColor=PAPER_MUTED)
fill_formula = PatternFill("solid", fgColor=FORMULA_BG)
fill_input = PatternFill("solid", fgColor=INPUT_BG)
fill_white = PatternFill("solid", fgColor=WHITE)
fill_green = PatternFill("solid", fgColor=GREEN_BG)
fill_amber = PatternFill("solid", fgColor=AMBER_BG)
fill_red = PatternFill("solid", fgColor=RED_BG)
fill_gray = PatternFill("solid", fgColor=GRAY_BG)
fill_card = PatternFill("solid", fgColor="F7F4EC")

center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left_mid = Alignment(horizontal="left", vertical="center", wrap_text=True)
right_mid = Alignment(horizontal="right", vertical="center")

prot_lock = Protection(locked=True)
prot_unlock = Protection(locked=False)

KONULAR_SHEET = "Konu Takibi"
YANLIS_SHEET = "Yanlışlarım"
DENEME_SHEET = "Deneme Takibi"
TEKRAR_SHEET = "Tekrar Takibi"
ISTAT_SHEET = "Soru İstatistikleri"
GUNLUK_SHEET = "Günlük Çalışma"
DASH_SHEET = "Dashboard"
LIST_SHEET = "_Listeler"
KILAVUZ_SHEET = "Kılavuz"

TYT_DENEME_START = 3
TYT_DENEME_N = 50
AYT_DENEME_HEADER = 56
AYT_DENEME_START = 57
AYT_DENEME_N = 50

GUNLUK_HEADER = 8
GUNLUK_N = 200
YANLIS_N = 250


def apply_col_widths(ws, widths: dict[str, float]) -> None:
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def header_row(ws, row, headers, fill=fill_ink) -> None:
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = font_h
        c.fill = fill
        c.alignment = center
        c.border = thin
        c.protection = prot_lock


def lock_sheet(ws, title: str) -> None:
    ws.protection.sheet = True
    ws.protection.password = ""
    ws.protection.enable = True
    ws.protection.autoFilter = True
    ws.protection.sort = True
    ws.protection.insertRows = True
    ws.protection.formatCells = True
    ws.protection.formatColumns = True
    ws.protection.formatRows = True
    ws.sheet_properties.tabColor = INK
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.5, bottom=0.5)
    ws.oddHeader.left.text = title
    ws.oddFooter.right.text = "NetDefter  ·  YKS Takip Sistemi  ·  Sayfa &P"


def style_input(cell, number_format=None) -> None:
    cell.fill = fill_input
    cell.font = font_body
    cell.alignment = center
    cell.border = thin
    cell.protection = prot_unlock
    if number_format:
        cell.number_format = number_format


def style_formula(cell, number_format=None) -> None:
    cell.fill = fill_formula
    cell.font = font_formula
    cell.alignment = center
    cell.border = thin
    cell.protection = prot_lock
    if number_format:
        cell.number_format = number_format


def style_text_input(cell) -> None:
    cell.fill = fill_input
    cell.font = font_body
    cell.alignment = left_mid
    cell.border = thin
    cell.protection = prot_unlock


def zebra(ws, row, cols, start=2) -> None:
    if (row - start) % 2 == 1:
        for col in range(1, cols + 1):
            if ws.cell(row=row, column=col).fill.fgColor.rgb in (
                None,
                "00000000",
                "FFF3F0E9",
            ):
                pass


def write_lists(wb: Workbook) -> None:
    ws = wb.create_sheet(LIST_SHEET)
    lists = {
        "A": ["Durum", "Başlamadım", "Çalışıyorum", "Bitti", "Tekrar Gerekli"],
        "B": [
            "Yanlış Nedeni",
            "Dikkat hatası",
            "Bilgi eksikliği",
            "Yöntem eksikliği",
            "Soruyu yanlış okudum",
            "İşlem hatası",
            "İki şık arasında kaldım",
            "Diğer",
        ],
        "C": ["Tekrar Sonucu", "Tekrar çözüldü", "Hâlâ yanlış", "Artık yapabiliyorum"],
        "D": [
            "Çalışma Türü",
            "Konu anlatımı",
            "Soru çözümü",
            "Tekrar",
            "Deneme",
            "Yanlış analizi",
        ],
        "E": ["Sınav", "TYT", "AYT"],
        "F": [
            "Ders",
            "Türkçe",
            "Matematik",
            "Geometri",
            "Fizik",
            "Kimya",
            "Biyoloji",
            "Tarih",
            "Coğrafya",
            "Felsefe",
            "Din Kültürü",
        ],
    }
    for col, values in lists.items():
        for i, v in enumerate(values, 1):
            cell = ws.cell(row=i, column=ord(col) - 64, value=v)
            if i == 1:
                cell.font = font_h
                cell.fill = fill_ink
            else:
                cell.font = font_body
    ws.sheet_state = "hidden"


def write_kilavuz(wb: Workbook) -> None:
    ws = wb.create_sheet(KILAVUZ_SHEET, 0)
    apply_col_widths(ws, {"A": 3, "B": 28, "C": 88, "D": 3})
    ws.row_dimensions[1].height = 36
    ws.merge_cells("B1:C1")
    t = ws["B1"]
    t.value = "NetDefter  ·  YKS Takip Sistemi  ·  Kullanım Kılavuzu"
    t.font = Font(name="Calibri", size=18, bold=True, color=WHITE)
    t.fill = fill_ink
    t.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    blocks = [
        (
            "Ne bu?",
            "TYT + AYT Sayısal için yıl boyu kullanacağın otomatik konu, soru, deneme, yanlış ve tekrar defteri. "
            "YDT ve AYT eşit ağırlık / sözel dersleri yok. Konu başlıkları 2026 MEB/ÖSYM müfredatına göre hazır; "
            "kaldırılan konular (evrim, vektörler, konikler, X-ışınları, dairesel permütasyon vb.) eklenmedi.",
        ),
        (
            "Nasıl doldurulur?",
            "Sadece beyaz hücrelere yaz. Bej / italik hücreler formüldür — dokunma. "
            "Konu Takibi'nde her satır bir alt konu. Örnek: TYT Matematik → Problemler → Hareket ve hız → "
            "Toplam 50, Doğru 40, Yanlış 8. Boş, net ve başarı % kendiliğinden gelir; Dashboard ve istatistikler güncellenir.",
        ),
        (
            "Net hesabı",
            "Net = Doğru − (Yanlış / 4). TYT ve AYT için aynı kural. Boş = Toplam − Doğru − Yanlış. "
            "Başarı % = Doğru / Toplam Soru.",
        ),
        (
            "Durum menüsü",
            "Başlamadım · Çalışıyorum · Bitti · Tekrar Gerekli. Renkler otomatik. "
            "Tekrar Tarihi yazdığın konular Tekrar Takibi sayfasında bugün / gecikmiş / 7 gün olarak listelenir.",
        ),
        (
            "Sayfalar",
            "Dashboard: özet ve grafikler.  Konu Takibi: tüm müfredat.  Yanlışlarım: soru bazlı hata defteri.  "
            "Deneme Takibi: TYT ve AYT sayısal denemeler (netler otomatik).  Tekrar Takibi: TODAY() ile hatırlatma.  "
            "Soru İstatistikleri: konu bazlı toplamlar ve zayıf konular.  Günlük Çalışma: süre ve soru sayacı.",
        ),
        (
            "Google Sheets",
            "Dosyayı Drive'a yükle → Google E-Tablolar ile aç. Formüller (COUNTIFS, SUMIFS, FILTER, TODAY) uyumludur. "
            "Grafikler Sheets'te yeniden oluşturulabilir. Açılır menüler ve koşullu biçim büyük ölçüde taşınır.",
        ),
        (
            "Koruma",
            "Formül sütunları kilitli, şifre yok. Yanlışlıkla formül silersen: Gözden Geçir → Sayfa Korumasını Kaldır. "
            "Girdi sütunları (beyaz) serbest.",
        ),
        (
            "İpucu",
            "Konu Takibi ve diğer tablolarda filtreler açık. Ders / durum / tarih ile süz. "
            "Deneme grafiği Dashboard'da TYT ve AYT toplam netinin zaman içindeki değişimini gösterir.",
        ),
    ]
    r = 3
    for title, body in blocks:
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        h = ws.cell(row=r, column=2, value=title)
        h.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
        h.fill = fill_teal
        h.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        ws.row_dimensions[r].height = 22
        r += 1
        ws.merge_cells(start_row=r, start_column=2, end_row=r + 1, end_column=3)
        b = ws.cell(row=r, column=2, value=body)
        b.font = Font(name="Calibri", size=11, color=FG)
        b.alignment = Alignment(wrap_text=True, vertical="top", indent=1)
        b.fill = fill_card
        ws.row_dimensions[r].height = 36
        ws.row_dimensions[r + 1].height = 36
        r += 3

    ws.sheet_view.showGridLines = False
    lock_sheet(ws, "Kılavuz")
    for row in ws.iter_rows(min_row=1, max_row=40, min_col=1, max_col=4):
        for c in row:
            c.protection = prot_lock


def write_konular(wb: Workbook, topics: list[dict]) -> int:
    ws = wb.create_sheet(KONULAR_SHEET)
    headers = [
        "Sınav",
        "Ders",
        "Konu",
        "Alt Konu",
        "Durum",
        "Toplam Soru",
        "Doğru",
        "Yanlış",
        "Boş",
        "Net",
        "Başarı %",
        "Son Çalışma Tarihi",
        "Tekrar Tarihi",
        "Kaynak",
        "Not",
    ]
    header_row(ws, 1, headers)
    ws.auto_filter.ref = f"A1:O{len(topics) + 1}"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:O{len(topics) + 1}"

    n = len(topics)
    for i, t in enumerate(topics, 2):
        alt = (i % 2 == 0)
        row_fill = fill_alt if alt else fill_paper

        for col, key in enumerate(("exam", "subject", "topic", "subtopic"), 1):
            c = ws.cell(row=i, column=col, value=t[key])
            c.font = font_body
            c.fill = row_fill
            c.alignment = left_mid
            c.border = thin
            c.protection = prot_lock

        # Durum
        c = ws.cell(row=i, column=5, value="Başlamadım")
        style_input(c)
        c.alignment = center

        for col in (6, 7, 8):
            c = ws.cell(row=i, column=col, value=None)
            style_input(c, "0")

        # Boş
        c = ws.cell(row=i, column=9, value=f'=IF(F{i}="","",MAX(0,F{i}-N(G{i})-N(H{i})))')
        style_formula(c, "0")
        # Net
        c = ws.cell(row=i, column=10, value=f'=IF(F{i}="","",N(G{i})-N(H{i})/4)')
        style_formula(c, "0.00")
        # Başarı
        c = ws.cell(row=i, column=11, value=f'=IF(OR(F{i}="",F{i}=0),"",N(G{i})/F{i})')
        style_formula(c, "0%")

        for col in (12, 13):
            c = ws.cell(row=i, column=col, value=None)
            style_input(c, "DD.MM.YYYY")
        for col in (14, 15):
            c = ws.cell(row=i, column=col, value=None)
            style_text_input(c)

        ws.row_dimensions[i].height = 18

    # Validations
    dv_durum = DataValidation(
        type="list", formula1=f"'{LIST_SHEET}'!$A$2:$A$5", allow_blank=True, showDropDown=False
    )
    dv_durum.error = "Listeden bir durum seçin."
    dv_durum.errorTitle = "Durum"
    dv_durum.prompt = "Durum seçin"
    dv_durum.promptTitle = "Durum"
    ws.add_data_validation(dv_durum)
    dv_durum.add(f"E2:E{n + 1}")

    # CF durum
    ws.conditional_formatting.add(
        f"E2:E{n + 1}",
        FormulaRule(formula=['$E2="Bitti"'], fill=fill_green, font=Font(name="Calibri", size=10, bold=True, color=GREEN)),
    )
    ws.conditional_formatting.add(
        f"E2:E{n + 1}",
        FormulaRule(formula=['$E2="Çalışıyorum"'], fill=fill_amber, font=Font(name="Calibri", size=10, bold=True, color=AMBER)),
    )
    ws.conditional_formatting.add(
        f"E2:E{n + 1}",
        FormulaRule(formula=['$E2="Tekrar Gerekli"'], fill=fill_red, font=Font(name="Calibri", size=10, bold=True, color=RED)),
    )
    ws.conditional_formatting.add(
        f"E2:E{n + 1}",
        FormulaRule(formula=['$E2="Başlamadım"'], fill=fill_gray, font=Font(name="Calibri", size=10, color=GRAY)),
    )
    ws.conditional_formatting.add(
        f"K2:K{n + 1}",
        ColorScaleRule(
            start_type="num", start_value=0, start_color="F0D6D2",
            mid_type="num", mid_value=0.5, mid_color="F0E2B8",
            end_type="num", end_value=1, end_color="D9E7D4",
        ),
    )

    apply_col_widths(
        ws,
        {
            "A": 10, "B": 14, "C": 28, "D": 42, "E": 16,
            "F": 13, "G": 10, "H": 10, "I": 8, "J": 10, "K": 12,
            "L": 18, "M": 16, "N": 18, "O": 28,
        },
    )
    ws.row_dimensions[1].height = 24
    lock_sheet(ws, "Konu Takibi")
    ws.sheet_properties.tabColor = TEAL
    return n


def write_yanlislar(wb: Workbook) -> None:
    ws = wb.create_sheet(YANLIS_SHEET)
    headers = [
        "Tarih",
        "Sınav",
        "Ders",
        "Konu",
        "Alt Konu",
        "Kaynak",
        "Soru No",
        "Yanlış Nedeni",
        "Doğru Çözüm / Kısa Not",
        "Tekrar Tarihi",
        "Tekrar Sonucu",
    ]
    header_row(ws, 1, headers)
    ws.freeze_panes = "A2"
    last = YANLIS_N + 1
    ws.auto_filter.ref = f"A1:K{last}"

    for i in range(2, last + 1):
        c = ws.cell(row=i, column=1)
        style_input(c, "DD.MM.YYYY")
        for col in (2, 3, 8, 11):
            c = ws.cell(row=i, column=col)
            style_input(c)
        for col in (4, 5, 6, 7, 9):
            c = ws.cell(row=i, column=col)
            style_text_input(c)
        c = ws.cell(row=i, column=10)
        style_input(c, "DD.MM.YYYY")
        ws.row_dimensions[i].height = 18

    def dv(formula, rng, title):
        v = DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
        v.promptTitle = title
        v.prompt = "Listeden seçin"
        ws.add_data_validation(v)
        v.add(rng)

    dv(f"'{LIST_SHEET}'!$E$2:$E$3", f"B2:B{last}", "Sınav")
    dv(f"'{LIST_SHEET}'!$F$2:$F$11", f"C2:C{last}", "Ders")
    dv(f"'{LIST_SHEET}'!$B$2:$B$8", f"H2:H{last}", "Yanlış Nedeni")
    dv(f"'{LIST_SHEET}'!$C$2:$C$4", f"K2:K{last}", "Tekrar Sonucu")

    ws.conditional_formatting.add(
        f"H2:H{last}",
        FormulaRule(formula=['$H2="Dikkat hatası"'], fill=fill_amber),
    )
    ws.conditional_formatting.add(
        f"H2:H{last}",
        FormulaRule(formula=['$H2="Bilgi eksikliği"'], fill=fill_red),
    )
    ws.conditional_formatting.add(
        f"H2:H{last}",
        FormulaRule(formula=['$H2="İşlem hatası"'], fill=fill_amber),
    )
    ws.conditional_formatting.add(
        f"K2:K{last}",
        FormulaRule(formula=['$K2="Artık yapabiliyorum"'], fill=fill_green, font=Font(name="Calibri", size=10, color=GREEN, bold=True)),
    )
    ws.conditional_formatting.add(
        f"K2:K{last}",
        FormulaRule(formula=['$K2="Hâlâ yanlış"'], fill=fill_red, font=Font(name="Calibri", size=10, color=RED, bold=True)),
    )

    apply_col_widths(
        ws,
        {
            "A": 14, "B": 10, "C": 14, "D": 22, "E": 28,
            "F": 16, "G": 10, "H": 22, "I": 36, "J": 16, "K": 20,
        },
    )
    ws.row_dimensions[1].height = 24
    lock_sheet(ws, "Yanlışlarım")
    ws.sheet_properties.tabColor = RED


def write_denemeler(wb: Workbook) -> None:
    ws = wb.create_sheet(DENEME_SHEET)
    apply_col_widths(
        ws,
        {
            "A": 14, "B": 22, "C": 12, "D": 12, "E": 12,
            "F": 12, "G": 12, "H": 12, "I": 12, "J": 12,
            "K": 12, "L": 12, "M": 12, "N": 12, "O": 16, "P": 28,
        },
    )

    # TYT block
    ws.merge_cells("A1:P1")
    h = ws["A1"]
    h.value = "TYT DENEMELERİ"
    h.font = font_title
    h.fill = fill_ink
    h.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    tyt_headers = [
        "Tarih", "Deneme Adı",
        "Türkçe D", "Türkçe Y", "Türkçe Net",
        "Matematik D", "Matematik Y", "Matematik Net",
        "Sosyal D", "Sosyal Y", "Sosyal Net",
        "Fen D", "Fen Y", "Fen Net",
        "TYT Toplam Net", "Not",
    ]
    header_row(ws, 2, tyt_headers, fill_teal)

    tyt_end = TYT_DENEME_START + TYT_DENEME_N - 1
    for i in range(TYT_DENEME_START, tyt_end + 1):
        c = ws.cell(row=i, column=1)
        style_input(c, "DD.MM.YYYY")
        style_text_input(ws.cell(row=i, column=2))
        for col in (3, 4, 6, 7, 9, 10, 12, 13):
            style_input(ws.cell(row=i, column=col), "0")
        # nets
        ws.cell(row=i, column=5, value=f'=IF(C{i}="","",N(C{i})-N(D{i})/4)')
        style_formula(ws.cell(row=i, column=5), "0.00")
        ws.cell(row=i, column=8, value=f'=IF(F{i}="","",N(F{i})-N(G{i})/4)')
        style_formula(ws.cell(row=i, column=8), "0.00")
        ws.cell(row=i, column=11, value=f'=IF(I{i}="","",N(I{i})-N(J{i})/4)')
        style_formula(ws.cell(row=i, column=11), "0.00")
        ws.cell(row=i, column=14, value=f'=IF(L{i}="","",N(L{i})-N(M{i})/4)')
        style_formula(ws.cell(row=i, column=14), "0.00")
        ws.cell(row=i, column=15, value=f'=IF(E{i}="","",E{i}+H{i}+K{i}+N{i})')
        style_formula(ws.cell(row=i, column=15), "0.00")
        style_text_input(ws.cell(row=i, column=16))

    # AYT block
    ws.merge_cells(start_row=AYT_DENEME_HEADER - 1, start_column=1, end_row=AYT_DENEME_HEADER - 1, end_column=16)
    h = ws.cell(row=AYT_DENEME_HEADER - 1, column=1, value="AYT SAYISAL DENEMELERİ")
    h.font = font_title
    h.fill = fill_ink
    h.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[AYT_DENEME_HEADER - 1].height = 28

    ayt_headers = [
        "Tarih", "Deneme Adı",
        "Matematik D", "Matematik Y", "Matematik Net",
        "Fizik D", "Fizik Y", "Fizik Net",
        "Kimya D", "Kimya Y", "Kimya Net",
        "Biyoloji D", "Biyoloji Y", "Biyoloji Net",
        "AYT Sayısal Toplam Net", "Not",
    ]
    header_row(ws, AYT_DENEME_HEADER, ayt_headers, fill_teal)

    ayt_end = AYT_DENEME_START + AYT_DENEME_N - 1
    for i in range(AYT_DENEME_START, ayt_end + 1):
        c = ws.cell(row=i, column=1)
        style_input(c, "DD.MM.YYYY")
        style_text_input(ws.cell(row=i, column=2))
        for col in (3, 4, 6, 7, 9, 10, 12, 13):
            style_input(ws.cell(row=i, column=col), "0")
        ws.cell(row=i, column=5, value=f'=IF(C{i}="","",N(C{i})-N(D{i})/4)')
        style_formula(ws.cell(row=i, column=5), "0.00")
        ws.cell(row=i, column=8, value=f'=IF(F{i}="","",N(F{i})-N(G{i})/4)')
        style_formula(ws.cell(row=i, column=8), "0.00")
        ws.cell(row=i, column=11, value=f'=IF(I{i}="","",N(I{i})-N(J{i})/4)')
        style_formula(ws.cell(row=i, column=11), "0.00")
        ws.cell(row=i, column=14, value=f'=IF(L{i}="","",N(L{i})-N(M{i})/4)')
        style_formula(ws.cell(row=i, column=14), "0.00")
        ws.cell(row=i, column=15, value=f'=IF(E{i}="","",E{i}+H{i}+K{i}+N{i})')
        style_formula(ws.cell(row=i, column=15), "0.00")
        style_text_input(ws.cell(row=i, column=16))

    ws.freeze_panes = "A3"
    ws.auto_filter.ref = f"A2:P{tyt_end}"

    # Mini summary on the right of title area — actually below AYT
    sum_row = ayt_end + 2
    ws.cell(row=sum_row, column=1, value="ÖZET").font = font_h2
    ws.cell(row=sum_row + 1, column=1, value="TYT deneme sayısı").font = font_label
    ws.cell(row=sum_row + 1, column=2, value=f'=COUNTA(B{TYT_DENEME_START}:B{tyt_end})')
    style_formula(ws.cell(row=sum_row + 1, column=2), "0")
    ws.cell(row=sum_row + 2, column=1, value="TYT ortalama net").font = font_label
    ws.cell(row=sum_row + 2, column=2, value=f'=IFERROR(AVERAGE(O{TYT_DENEME_START}:O{tyt_end}),"")')
    style_formula(ws.cell(row=sum_row + 2, column=2), "0.00")
    ws.cell(row=sum_row + 3, column=1, value="AYT deneme sayısı").font = font_label
    ws.cell(row=sum_row + 3, column=2, value=f'=COUNTA(B{AYT_DENEME_START}:B{ayt_end})')
    style_formula(ws.cell(row=sum_row + 3, column=2), "0")
    ws.cell(row=sum_row + 4, column=1, value="AYT ortalama net").font = font_label
    ws.cell(row=sum_row + 4, column=2, value=f'=IFERROR(AVERAGE(O{AYT_DENEME_START}:O{ayt_end}),"")')
    style_formula(ws.cell(row=sum_row + 4, column=2), "0.00")

    lock_sheet(ws, "Deneme Takibi")
    ws.sheet_properties.tabColor = "3D5A4C"


def write_tekrar(wb: Workbook, n_topics: int) -> None:
    ws = wb.create_sheet(TEKRAR_SHEET)
    apply_col_widths(
        ws,
        {"A": 10, "B": 16, "C": 28, "D": 40, "E": 16, "F": 16, "G": 16, "H": 22},
    )
    ws.merge_cells("A1:H1")
    t = ws["A1"]
    t.value = 'TEKRAR TAKİBİ   ·   Tarih otomatik:  =TODAY()'
    t.font = font_title
    t.fill = fill_ink
    t.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    ws["A2"] = "Bugün"
    ws["B2"] = "=TODAY()"
    ws["B2"].number_format = "DD.MM.YYYY"
    ws["B2"].font = font_kpi
    ws["B2"].fill = fill_card
    ws["C2"] = "Bu sayfa Konu Takibi'ndeki Tekrar Tarihi sütununa bakarak kendiliğinden dolar. Konu eklemek için Konu Takibi'ne tarih yaz."
    ws["C2"].font = font_small
    ws.merge_cells("C2:H2")

    src = f"'{KONULAR_SHEET}'"
    last = n_topics + 1
    rng = f"{src}!A2:M{last}"

    sections = [
        (4, "BUGÜN TEKRAR EDİLECEKLER", f'=IFERROR(FILTER({src}!A2:N{last},({src}!M2:M{last}=TODAY())*({src}!M2:M{last}<>"")),"Bugün tekrar yok")'),
        (22, "GECİKMİŞ TEKRARLAR", f'=IFERROR(FILTER({src}!A2:N{last},({src}!M2:M{last}<TODAY())*({src}!M2:M{last}<>"")*({src}!E2:E{last}<>"Bitti"),"Gecikmiş tekrar yok")'),
        (48, "ÖNÜMÜZDEKİ 7 GÜN", f'=IFERROR(FILTER({src}!A2:N{last},({src}!M2:M{last}>TODAY())*({src}!M2:M{last}<=TODAY()+7),"Önümüzdeki 7 günde tekrar yok")'),
        (70, "TAMAMLANAN TEKRARLAR", f'=IFERROR(FILTER({src}!A2:N{last},({src}!E2:E{last}="Bitti")*({src}!M2:M{last}<>""),"Tamamlanan tekrar yok")'),
    ]
    cols = ["Sınav", "Ders", "Konu", "Alt Konu", "Durum", "Son Çalışma", "Tekrar Tarihi", "Kaynak"]
    # FILTER returns A:N — too many cols. Better FILTER specific columns.
    # Excel FILTER can take a constructed array but that's 365-only with HSTACK.
    # We'll FILTER A:M and hide unused by only showing A-E, L, M, N via FILTER of those.
    # Simpler: FILTER the whole A:N and set column widths; extra cols (F-K) will appear.
    # Better formula using CHOOSECOLS if available (Excel 365 + Sheets).
    # CHOOSECOLS(FILTER(...),1,2,3,4,5,12,13,14)
    sections = [
        (
            4,
            "BUGÜN TEKRAR EDİLECEKLER",
            f'=IFERROR(CHOOSECOLS(FILTER({src}!A2:N{last},({src}!M2:M{last}=TODAY())*({src}!M2:M{last}<>"")),1,2,3,4,5,12,13,14),"Bugün tekrar yok")',
        ),
        (
            22,
            "GECİKMİŞ TEKRARLAR",
            f'=IFERROR(CHOOSECOLS(FILTER({src}!A2:N{last},({src}!M2:M{last}<TODAY())*({src}!M2:M{last}<>"")*({src}!E2:E{last}<>"Bitti")),1,2,3,4,5,12,13,14),"Gecikmiş tekrar yok")',
        ),
        (
            48,
            "ÖNÜMÜZDEKİ 7 GÜN",
            f'=IFERROR(CHOOSECOLS(FILTER({src}!A2:N{last},({src}!M2:M{last}>TODAY())*({src}!M2:M{last}<=TODAY()+7)),1,2,3,4,5,12,13,14),"Önümüzdeki 7 günde tekrar yok")',
        ),
        (
            70,
            "TAMAMLANAN TEKRARLAR",
            f'=IFERROR(CHOOSECOLS(FILTER({src}!A2:N{last},({src}!E2:E{last}="Bitti")*({src}!M2:M{last}<>"")),1,2,3,4,5,12,13,14),"Tamamlanan tekrar yok")',
        ),
    ]

    fills = [fill_teal, fill_red, fill_amber, fill_green]
    fonts_sec = [
        Font(name="Calibri", size=12, bold=True, color=WHITE),
        Font(name="Calibri", size=12, bold=True, color=WHITE),
        Font(name="Calibri", size=12, bold=True, color=AMBER),
        Font(name="Calibri", size=12, bold=True, color=GREEN),
    ]
    header_fills = [fill_teal, PatternFill("solid", fgColor=RED), PatternFill("solid", fgColor=AMBER), PatternFill("solid", fgColor=GREEN)]

    for (row, title, formula), hf in zip(sections, header_fills):
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
        c = ws.cell(row=row, column=1, value=title)
        c.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
        c.fill = hf
        c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        ws.row_dimensions[row].height = 22
        header_row(ws, row + 1, cols, hf)
        fcell = ws.cell(row=row + 2, column=1, value=formula)
        fcell.font = font_formula
        fcell.protection = prot_lock

    ws.sheet_view.showGridLines = False
    lock_sheet(ws, "Tekrar Takibi")
    ws.sheet_properties.tabColor = AMBER


def unique_topics(topics: list[dict]) -> list[tuple[str, str, str]]:
    seen = []
    got = set()
    for t in topics:
        key = (t["exam"], t["subject"], t["topic"])
        if key not in got:
            got.add(key)
            seen.append(key)
    return seen


def write_istatistik(wb: Workbook, topics: list[dict], n_topics: int) -> None:
    ws = wb.create_sheet(ISTAT_SHEET)
    keys = unique_topics(topics)
    apply_col_widths(
        ws,
        {"A": 10, "B": 14, "C": 32, "D": 14, "E": 10, "F": 10, "G": 10, "H": 10, "I": 12, "J": 12},
    )

    ws.merge_cells("A1:J1")
    t = ws["A1"]
    t.value = "SORU İSTATİSTİKLERİ  ·  Konu Takibi'nden otomatik toplanır"
    t.font = font_title
    t.fill = fill_ink
    t.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    headers = [
        "Sınav", "Ders", "Konu",
        "Toplam Soru", "Doğru", "Yanlış", "Boş", "Net", "Başarı %", "Soru Var?",
    ]
    header_row(ws, 2, headers, fill_teal)
    ws.freeze_panes = "A3"

    src = f"'{KONULAR_SHEET}'"
    last = n_topics + 1
    for i, (exam, subject, topic) in enumerate(keys, 3):
        ws.cell(row=i, column=1, value=exam).font = font_body
        ws.cell(row=i, column=2, value=subject).font = font_body
        ws.cell(row=i, column=3, value=topic).font = font_body
        for col in range(1, 4):
            ws.cell(row=i, column=col).fill = fill_alt if i % 2 == 0 else fill_paper
            ws.cell(row=i, column=col).border = thin
            ws.cell(row=i, column=col).alignment = left_mid
            ws.cell(row=i, column=col).protection = prot_lock

        crit = f'{src}!$A$2:$A${last},{ws.cell(row=i, column=1).coordinate},{src}!$B$2:$B${last},{ws.cell(row=i, column=2).coordinate},{src}!$C$2:$C${last},{ws.cell(row=i, column=3).coordinate}'
        # Use quoted literals instead of cell refs for robustness
        a, b, c = exam.replace('"', '""'), subject.replace('"', '""'), topic.replace('"', '""')
        ws.cell(row=i, column=4, value=f'=SUMIFS({src}!$F$2:$F${last},{src}!$A$2:$A${last},"{a}",{src}!$B$2:$B${last},"{b}",{src}!$C$2:$C${last},"{c}")')
        ws.cell(row=i, column=5, value=f'=SUMIFS({src}!$G$2:$G${last},{src}!$A$2:$A${last},"{a}",{src}!$B$2:$B${last},"{b}",{src}!$C$2:$C${last},"{c}")')
        ws.cell(row=i, column=6, value=f'=SUMIFS({src}!$H$2:$H${last},{src}!$A$2:$A${last},"{a}",{src}!$B$2:$B${last},"{b}",{src}!$C$2:$C${last},"{c}")')
        ws.cell(row=i, column=7, value=f'=IF(D{i}=0,"",MAX(0,D{i}-E{i}-F{i}))')
        ws.cell(row=i, column=8, value=f'=IF(D{i}=0,"",E{i}-F{i}/4)')
        ws.cell(row=i, column=9, value=f'=IF(D{i}=0,"",E{i}/D{i})')
        ws.cell(row=i, column=10, value=f'=IF(D{i}>0,"Evet","")')
        for col in range(4, 11):
            style_formula(ws.cell(row=i, column=col))
        ws.cell(row=i, column=4).number_format = "0"
        ws.cell(row=i, column=5).number_format = "0"
        ws.cell(row=i, column=6).number_format = "0"
        ws.cell(row=i, column=7).number_format = "0"
        ws.cell(row=i, column=8).number_format = "0.00"
        ws.cell(row=i, column=9).number_format = "0%"

    end = 2 + len(keys)
    ws.auto_filter.ref = f"A2:J{end}"
    ws.conditional_formatting.add(
        f"I3:I{end}",
        ColorScaleRule(
            start_type="num", start_value=0, start_color="F0D6D2",
            mid_type="num", mid_value=0.5, mid_color="F0E2B8",
            end_type="num", end_value=1, end_color="D9E7D4",
        ),
    )

    # Weak topics
    weak_row = end + 3
    ws.merge_cells(start_row=weak_row, start_column=1, end_row=weak_row, end_column=9)
    c = ws.cell(row=weak_row, column=1, value="EN DÜŞÜK BAŞARI  ·  en az 10 soru çözülmüş konular")
    c.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
    c.fill = PatternFill("solid", fgColor=RED)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    header_row(ws, weak_row + 1, ["Sınav", "Ders", "Konu", "Toplam Soru", "Doğru", "Yanlış", "Boş", "Net", "Başarı %"], PatternFill("solid", fgColor=RED))
    f = ws.cell(
        row=weak_row + 2,
        column=1,
        value=f'=IFERROR(CHOOSECOLS(SORT(FILTER(A3:I{end},(D3:D{end}>=10)*(I3:I{end}<>"")),9,1),1,2,3,4,5,6,7,8,9),"Henüz 10 soru çözülmüş konu yok")',
    )
    f.font = font_formula
    f.protection = prot_lock

    lock_sheet(ws, "Soru İstatistikleri")
    ws.sheet_properties.tabColor = "5C4A3A"


def write_gunluk(wb: Workbook) -> None:
    ws = wb.create_sheet(GUNLUK_SHEET)
    apply_col_widths(
        ws,
        {
            "A": 14, "B": 16, "C": 28, "D": 16, "E": 12,
            "F": 14, "G": 10, "H": 10, "I": 10, "J": 32, "K": 3, "L": 22, "M": 14,
        },
    )
    ws.merge_cells("A1:J1")
    t = ws["A1"]
    t.value = "GÜNLÜK ÇALIŞMA"
    t.font = font_title
    t.fill = fill_ink
    t.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    # KPI strip
    kpis = [
        (3, 1, "Bugün", "=TODAY()", "DD.MM.YYYY"),
        (3, 3, "Günlük süre (dk)", f'=SUMIF(A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},TODAY(),E{GUNLUK_HEADER+1}:E{GUNLUK_HEADER+GUNLUK_N})', "0"),
        (3, 5, "Günlük soru", f'=SUMIF(A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},TODAY(),F{GUNLUK_HEADER+1}:F{GUNLUK_HEADER+GUNLUK_N})', "0"),
        (3, 7, "Günlük net", f'=SUMIF(A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},TODAY(),I{GUNLUK_HEADER+1}:I{GUNLUK_HEADER+GUNLUK_N})', "0.00"),
        (5, 1, "Haftalık süre (dk)", f'=SUMIFS(E{GUNLUK_HEADER+1}:E{GUNLUK_HEADER+GUNLUK_N},A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},">="&TODAY()-6,A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},"<="&TODAY())', "0"),
        (5, 3, "Haftalık soru", f'=SUMIFS(F{GUNLUK_HEADER+1}:F{GUNLUK_HEADER+GUNLUK_N},A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},">="&TODAY()-6,A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},"<="&TODAY())', "0"),
        (5, 5, "Haftalık net", f'=SUMIFS(I{GUNLUK_HEADER+1}:I{GUNLUK_HEADER+GUNLUK_N},A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},">="&TODAY()-6,A{GUNLUK_HEADER+1}:A{GUNLUK_HEADER+GUNLUK_N},"<="&TODAY())', "0.00"),
        (5, 7, "Kayıt sayısı", f'=COUNTA(B{GUNLUK_HEADER+1}:B{GUNLUK_HEADER+GUNLUK_N})', "0"),
    ]
    for row, col, label, formula, fmt in kpis:
        lab = ws.cell(row=row, column=col, value=label)
        lab.font = font_label
        lab.fill = fill_muted
        lab.alignment = center
        lab.border = thin
        lab.protection = prot_lock
        val = ws.cell(row=row, column=col + 1, value=formula)
        style_formula(val, fmt)
        val.font = font_kpi
        val.fill = fill_card

    headers = [
        "Tarih", "Ders", "Konu", "Çalışma türü", "Süre (dk)",
        "Çözülen soru", "Doğru", "Yanlış", "Net", "Not",
    ]
    header_row(ws, GUNLUK_HEADER, headers)
    last = GUNLUK_HEADER + GUNLUK_N
    ws.freeze_panes = f"A{GUNLUK_HEADER + 1}"
    ws.auto_filter.ref = f"A{GUNLUK_HEADER}:J{last}"

    for i in range(GUNLUK_HEADER + 1, last + 1):
        style_input(ws.cell(row=i, column=1), "DD.MM.YYYY")
        style_input(ws.cell(row=i, column=2))
        style_text_input(ws.cell(row=i, column=3))
        style_input(ws.cell(row=i, column=4))
        for col in (5, 6, 7, 8):
            style_input(ws.cell(row=i, column=col), "0")
        ws.cell(row=i, column=9, value=f'=IF(F{i}="","",N(G{i})-N(H{i})/4)')
        style_formula(ws.cell(row=i, column=9), "0.00")
        style_text_input(ws.cell(row=i, column=10))

    dv_ders = DataValidation(type="list", formula1=f"'{LIST_SHEET}'!$F$2:$F$11", allow_blank=True, showDropDown=False)
    ws.add_data_validation(dv_ders)
    dv_ders.add(f"B{GUNLUK_HEADER+1}:B{last}")
    dv_tur = DataValidation(type="list", formula1=f"'{LIST_SHEET}'!$D$2:$D$6", allow_blank=True, showDropDown=False)
    ws.add_data_validation(dv_tur)
    dv_tur.add(f"D{GUNLUK_HEADER+1}:D{last}")

    lock_sheet(ws, "Günlük Çalışma")
    ws.sheet_properties.tabColor = TEAL


def kpi_box(ws, row, col, label, formula, fmt, span=2) -> None:
    ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + span - 1)
    lab = ws.cell(row=row, column=col, value=label)
    lab.font = font_label
    lab.fill = fill_muted
    lab.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    lab.border = thin
    lab.protection = prot_lock
    ws.merge_cells(start_row=row + 1, start_column=col, end_row=row + 1, end_column=col + span - 1)
    val = ws.cell(row=row + 1, column=col, value=formula)
    val.font = font_kpi
    val.fill = fill_card
    val.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    val.number_format = fmt
    val.border = thin
    val.protection = prot_lock
    ws.row_dimensions[row].height = 16
    ws.row_dimensions[row + 1].height = 26


def write_dashboard(wb: Workbook, n_topics: int, topics: list[dict]) -> None:
    ws = wb.create_sheet(DASH_SHEET, 1)
    for col in range(1, 20):
        ws.column_dimensions[get_column_letter(col)].width = 12
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 14
    ws.column_dimensions["F"].width = 3
    ws.column_dimensions["G"].width = 16
    ws.column_dimensions["H"].width = 12
    ws.column_dimensions["I"].width = 12
    ws.column_dimensions["J"].width = 14
    ws.column_dimensions["K"].width = 3
    ws.column_dimensions["L"].width = 16
    ws.column_dimensions["M"].width = 12
    ws.column_dimensions["N"].width = 12
    ws.column_dimensions["O"].width = 14

    ws.merge_cells("B1:O1")
    t = ws["B1"]
    t.value = "NETDEFTER   ·   YKS TAKİP   ·   TYT + AYT SAYISAL"
    t.font = font_title
    t.fill = fill_ink
    t.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 34

    ws.merge_cells("B2:E2")
    ws["B2"] = '=CONCATENATE("Bugün  ",TEXT(TODAY(),"DD.MM.YYYY"))'
    ws["B2"].font = Font(name="Calibri", size=11, italic=True, color=MUTED)
    ws["B2"].alignment = left_mid

    src = f"'{KONULAR_SHEET}'"
    last = n_topics + 1
    A = f"{src}!$A$2:$A${last}"
    B = f"{src}!$B$2:$B${last}"
    E = f"{src}!$E$2:$E${last}"
    F = f"{src}!$F$2:$F${last}"
    G = f"{src}!$G$2:$G${last}"
    H = f"{src}!$H$2:$H${last}"
    I = f"{src}!$I$2:$I${last}"
    J = f"{src}!$J$2:$J${last}"

    # Section titles
    ws.merge_cells("B3:E3")
    ws["B3"] = "TYT"
    ws["B3"].font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    ws["B3"].fill = fill_teal
    ws["B3"].alignment = Alignment(horizontal="left", vertical="center", indent=1)

    ws.merge_cells("G3:J3")
    ws["G3"] = "AYT SAYISAL"
    ws["G3"].font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    ws["G3"].fill = fill_ink
    ws["G3"].alignment = Alignment(horizontal="left", vertical="center", indent=1)

    ws.merge_cells("L3:O3")
    ws["L3"] = "GENEL"
    ws["L3"].font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    ws["L3"].fill = PatternFill("solid", fgColor="3D5A4C")
    ws["L3"].alignment = Alignment(horizontal="left", vertical="center", indent=1)

    tyt = [
        (4, "Toplam konu", f'=COUNTIF({A},"TYT")', "0"),
        (6, "Biten konu", f'=COUNTIFS({A},"TYT",{E},"Bitti")', "0"),
        (8, "Çalışılan konu", f'=COUNTIFS({A},"TYT",{E},"Çalışıyorum")', "0"),
        (10, "Başlanmamış", f'=COUNTIFS({A},"TYT",{E},"Başlamadım")', "0"),
        (12, "Tekrar gereken", f'=COUNTIFS({A},"TYT",{E},"Tekrar Gerekli")', "0"),
        (14, "Konu ilerleme %", f'=IF(COUNTIF({A},"TYT")=0,"",COUNTIFS({A},"TYT",{E},"Bitti")/COUNTIF({A},"TYT"))', "0%"),
        (16, "Toplam soru", f'=SUMIF({A},"TYT",{F})', "0"),
        (18, "Toplam doğru", f'=SUMIF({A},"TYT",{G})', "0"),
        (20, "Toplam yanlış", f'=SUMIF({A},"TYT",{H})', "0"),
        (22, "Toplam boş", f'=SUMIF({A},"TYT",{I})', "0"),
        (24, "Toplam net", f'=SUMIF({A},"TYT",{J})', "0.00"),
        (26, "Başarı %", f'=IF(SUMIF({A},"TYT",{F})=0,"",SUMIF({A},"TYT",{G})/SUMIF({A},"TYT",{F}))', "0%"),
    ]
    ayt = [
        (4, "Toplam konu", f'=COUNTIF({A},"AYT")', "0"),
        (6, "Biten konu", f'=COUNTIFS({A},"AYT",{E},"Bitti")', "0"),
        (8, "Çalışılan konu", f'=COUNTIFS({A},"AYT",{E},"Çalışıyorum")', "0"),
        (10, "Başlanmamış", f'=COUNTIFS({A},"AYT",{E},"Başlamadım")', "0"),
        (12, "Tekrar gereken", f'=COUNTIFS({A},"AYT",{E},"Tekrar Gerekli")', "0"),
        (14, "Konu ilerleme %", f'=IF(COUNTIF({A},"AYT")=0,"",COUNTIFS({A},"AYT",{E},"Bitti")/COUNTIF({A},"AYT"))', "0%"),
        (16, "Toplam soru", f'=SUMIF({A},"AYT",{F})', "0"),
        (18, "Toplam doğru", f'=SUMIF({A},"AYT",{G})', "0"),
        (20, "Toplam yanlış", f'=SUMIF({A},"AYT",{H})', "0"),
        (22, "Toplam boş", f'=SUMIF({A},"AYT",{I})', "0"),
        (24, "Toplam net", f'=SUMIF({A},"AYT",{J})', "0.00"),
        (26, "Başarı %", f'=IF(SUMIF({A},"AYT",{F})=0,"",SUMIF({A},"AYT",{G})/SUMIF({A},"AYT",{F}))', "0%"),
    ]
    gen = [
        (4, "Toplam soru", f'=SUM({F})', "0"),
        (6, "Toplam doğru", f'=SUM({G})', "0"),
        (8, "Toplam yanlış", f'=SUM({H})', "0"),
        (10, "Toplam net", f'=SUM({J})', "0.00"),
        (12, "Genel konu ilerleme %", f'=IF(COUNTA({A})=0,"",COUNTIF({E},"Bitti")/COUNTA({A}))', "0%"),
        (14, "TYT deneme ort. net", f"=IFERROR(AVERAGE('{DENEME_SHEET}'!O{TYT_DENEME_START}:O{TYT_DENEME_START+TYT_DENEME_N-1}),\"—\")", "0.00"),
        (16, "AYT deneme ort. net", f"=IFERROR(AVERAGE('{DENEME_SHEET}'!O{AYT_DENEME_START}:O{AYT_DENEME_START+AYT_DENEME_N-1}),\"—\")", "0.00"),
    ]
    for row, label, formula, fmt in tyt:
        kpi_box(ws, row, 2, label, formula, fmt, 4)
    for row, label, formula, fmt in ayt:
        kpi_box(ws, row, 7, label, formula, fmt, 4)
    for row, label, formula, fmt in gen:
        kpi_box(ws, row, 12, label, formula, fmt, 4)

    # Ders bazında ilerleme
    start = 29
    ws.merge_cells(start_row=start, start_column=2, end_row=start, end_column=10)
    h = ws.cell(row=start, column=2, value="DERS BAZINDA KONU İLERLEME")
    h.font = Font(name="Calibri", size=13, bold=True, color=WHITE)
    h.fill = fill_ink
    h.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    headers = ["Sınav", "Ders", "Toplam", "Biten", "Çalışılan", "Başlanmamış", "Tekrar", "İlerleme %", "Başarı %"]
    for i, name in enumerate(headers, 2):
        c = ws.cell(row=start + 1, column=i, value=name)
        c.font = font_h
        c.fill = fill_teal
        c.alignment = center
        c.border = thin
        c.protection = prot_lock

    r = start + 2
    subject_rows = []
    for exam, subjects in SUBJECT_ORDER.items():
        for subj in subjects:
            subject_rows.append((r, exam, subj))
            ws.cell(row=r, column=2, value=exam)
            ws.cell(row=r, column=3, value=subj)
            a, b = exam, subj
            ws.cell(row=r, column=4, value=f'=COUNTIFS({A},"{a}",{B},"{b}")')
            ws.cell(row=r, column=5, value=f'=COUNTIFS({A},"{a}",{B},"{b}",{E},"Bitti")')
            ws.cell(row=r, column=6, value=f'=COUNTIFS({A},"{a}",{B},"{b}",{E},"Çalışıyorum")')
            ws.cell(row=r, column=7, value=f'=COUNTIFS({A},"{a}",{B},"{b}",{E},"Başlamadım")')
            ws.cell(row=r, column=8, value=f'=COUNTIFS({A},"{a}",{B},"{b}",{E},"Tekrar Gerekli")')
            ws.cell(row=r, column=9, value=f'=IF(D{r}=0,"",E{r}/D{r})')
            ws.cell(row=r, column=10, value=f'=IF(SUMIFS({F},{A},"{a}",{B},"{b}")=0,"",SUMIFS({G},{A},"{a}",{B},"{b}")/SUMIFS({F},{A},"{a}",{B},"{b}"))')
            for col in range(2, 11):
                cell = ws.cell(row=r, column=col)
                cell.border = thin
                cell.protection = prot_lock
                cell.alignment = center if col > 3 else left_mid
                cell.font = font_body
                cell.fill = fill_paper if exam == "TYT" else fill_alt
            ws.cell(row=r, column=9).number_format = "0%"
            ws.cell(row=r, column=10).number_format = "0%"
            r += 1

    subj_end = r - 1
    ws.conditional_formatting.add(
        f"I{start+2}:I{subj_end}",
        ColorScaleRule(
            start_type="num", start_value=0, start_color="F0D6D2",
            mid_type="num", mid_value=0.5, mid_color="F0E2B8",
            end_type="num", end_value=1, end_color="D9E7D4",
        ),
    )

    # Chart data (hidden-ish to the right)
    # Status pie data
    ws["Q3"] = "Durum"
    ws["R3"] = "TYT"
    ws["S3"] = "AYT"
    statuses = ["Bitti", "Çalışıyorum", "Başlamadım", "Tekrar Gerekli"]
    for i, st in enumerate(statuses):
        ws.cell(row=4 + i, column=17, value=st)
        ws.cell(row=4 + i, column=18, value=f'=COUNTIFS({A},"TYT",{E},Q{4+i})')
        ws.cell(row=4 + i, column=19, value=f'=COUNTIFS({A},"AYT",{E},Q{4+i})')

    pie = PieChart()
    pie.title = "TYT konu durumu"
    labels = Reference(ws, min_col=17, min_row=4, max_row=7)
    data = Reference(ws, min_col=18, min_row=3, max_row=7)
    pie.add_data(data, titles_from_data=True)
    pie.set_categories(labels)
    pie.dataLabels = DataLabelList()
    pie.dataLabels.showPercent = True
    pie.dataLabels.showVal = False
    pie.dataLabels.showCatName = False
    pie.width = 12
    pie.height = 7
    ws.add_chart(pie, "B48")

    pie2 = PieChart()
    pie2.title = "AYT konu durumu"
    data2 = Reference(ws, min_col=19, min_row=3, max_row=7)
    pie2.add_data(data2, titles_from_data=True)
    pie2.set_categories(labels)
    pie2.dataLabels = DataLabelList()
    pie2.dataLabels.showPercent = True
    pie2.width = 12
    pie2.height = 7
    ws.add_chart(pie2, "G48")

    bar = BarChart()
    bar.type = "col"
    bar.title = "Ders bazında konu ilerleme %"
    bar.y_axis.title = "İlerleme"
    bar.y_axis.scaling.min = 0
    bar.y_axis.scaling.max = 1
    # Need a compact data table of subject names + progress
    ws["Q10"] = "Ders"
    ws["R10"] = "İlerleme"
    for i, (rr, exam, subj) in enumerate(subject_rows):
        ws.cell(row=11 + i, column=17, value=f"{exam} {subj}")
        ws.cell(row=11 + i, column=18, value=f"=I{rr}")
        ws.cell(row=11 + i, column=18).number_format = "0%"
    data_b = Reference(ws, min_col=18, min_row=10, max_row=10 + len(subject_rows))
    cats_b = Reference(ws, min_col=17, min_row=11, max_row=10 + len(subject_rows))
    bar.add_data(data_b, titles_from_data=True)
    bar.set_categories(cats_b)
    bar.shape = 4
    bar.width = 22
    bar.height = 8
    bar.legend = None
    ws.add_chart(bar, "B64")

    # Deneme trend — uses first 50 TYT rows dates + nets
    line = LineChart()
    line.title = "TYT deneme toplam net (zaman)"
    line.y_axis.title = "Net"
    line.style = 10
    line.width = 18
    line.height = 7
    den = wb[DENEME_SHEET]
    # Chart must live on dashboard but can reference other sheets
    data_l = Reference(den, min_col=15, min_row=2, max_row=TYT_DENEME_START + TYT_DENEME_N - 1)
    cats_l = Reference(den, min_col=1, min_row=TYT_DENEME_START, max_row=TYT_DENEME_START + TYT_DENEME_N - 1)
    line.add_data(data_l, titles_from_data=True)
    line.set_categories(cats_l)
    line.legend = None
    ws.add_chart(line, "B82")

    line2 = LineChart()
    line2.title = "AYT sayısal deneme toplam net (zaman)"
    line2.y_axis.title = "Net"
    line2.style = 12
    line2.width = 18
    line2.height = 7
    data_l2 = Reference(den, min_col=15, min_row=AYT_DENEME_HEADER, max_row=AYT_DENEME_START + AYT_DENEME_N - 1)
    cats_l2 = Reference(den, min_col=1, min_row=AYT_DENEME_START, max_row=AYT_DENEME_START + AYT_DENEME_N - 1)
    line2.add_data(data_l2, titles_from_data=True)
    line2.set_categories(cats_l2)
    line2.legend = None
    ws.add_chart(line2, "B98")

    note = ws["B46"]
    note.value = "Grafikler Konu Takibi ve Deneme Takibi doldukça otomatik güncellenir. Formül hücreleri kilitlidir."
    note.font = font_small
    ws.merge_cells("B46:O46")

    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "B3"
    lock_sheet(ws, "Dashboard")
    ws.sheet_properties.tabColor = INK
    ws.sheet_view.zoomScale = 110


def dump_json(topics: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(topics, ensure_ascii=False, indent=2), encoding="utf-8")


def build(out_xlsx: Path, out_json: Path) -> None:
    topics = flatten_topics()
    dump_json(topics, out_json)

    wb = Workbook()
    # remove default
    default = wb.active
    wb.remove(default)

    write_lists(wb)
    write_kilavuz(wb)
    n = write_konular(wb, topics)
    write_yanlislar(wb)
    write_denemeler(wb)
    write_tekrar(wb, n)
    write_istatistik(wb, topics, n)
    write_gunluk(wb)
    write_dashboard(wb, n, topics)

    # Reorder
    order = [
        KILAVUZ_SHEET,
        DASH_SHEET,
        KONULAR_SHEET,
        YANLIS_SHEET,
        DENEME_SHEET,
        TEKRAR_SHEET,
        ISTAT_SHEET,
        GUNLUK_SHEET,
        LIST_SHEET,
    ]
    for i, name in enumerate(order):
        wb.move_sheet(name, offset=i - wb.sheetnames.index(name))

    wb.properties.title = "NetDefter YKS Takip Sistemi"
    wb.properties.creator = "NetDefter"
    wb.properties.description = "TYT + AYT Sayısal konu, deneme, yanlış ve tekrar takip sistemi (2026 MEB/ÖSYM)."
    wb.calculation.calcMode = "auto"
    wb.calculation.fullCalcOnLoad = True

    out_xlsx.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_xlsx)
    print(f"Wrote {out_xlsx}  ({n} konu satırı)")
    print(f"Wrote {out_json}")


if __name__ == "__main__":
    root = Path("/workspace")
    json_path = root / "src" / "data" / "curriculum.json"
    build(root / "public" / "YKS-Takip-Sistemi.xlsx", json_path)
    import shutil

    art = root / "artifacts" / "YKS-Takip-Sistemi.xlsx"
    art.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / "public" / "YKS-Takip-Sistemi.xlsx", art)
    print(f"Copied {art}")
