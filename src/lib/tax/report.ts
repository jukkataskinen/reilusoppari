/**
 * Verolaskelman rivit (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * LASKELMA EI PÄÄTÄ MITÄÄN, SE LASKEE YHTEEN
 *
 * Rivit ovat käyttäjän omia kirjauksia luokittain. Laskelma ei arvioi, onko
 * kulu vähennyskelpoinen — se kertoo mihin luokkaan se on kirjattu ja mitä
 * luokasta seuraa. Ero on olennainen: edellinen olisi veroneuvontaa.
 *
 * KAKSI OSIOTA, KOSKA KAIKKI EI OLE VUOSIKULUA
 *
 * Rahastoitu rahoitusvastike lisätään hankintamenoon, perusparannus
 * vähennetään poistoina ja korot ilmoitetaan omana kohtanaan. Jos ne
 * summautuisivat vuosikuluihin, laskelma olisi väärä juuri siinä kohdassa,
 * jossa virhe maksaa eniten.
 *
 * Siksi laskelmassa on kaksi summaa: vuosikulut ja "muut kirjaukset". Ne
 * eivät ole toistensa osajoukkoja eikä niitä lasketa yhteen missään.
 *
 * VUOKRATULO TULEE KUITTAUKSISTA
 *
 * Tulo on se, minkä vuokranantaja on itse merkinnyt saaneensa: "Kyllä" on
 * koko vuokra, "Osittain" se summa jonka hän kirjasi, "Ei vielä" nolla.
 * Kuittaamaton kuukausi ei ole tuloa — vuokranantaja ei ole sanonut siitä
 * mitään.
 * ===========================================================================
 */

import {
  categoryInfo,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "../expenses/categories";
import type { ConfirmationStatus } from "../rent/confirmation";

export interface ReportExpense {
  date: string;
  amount: number;
  category: ExpenseCategory;
  km: number | null;
}

export interface ReportConfirmation {
  dueDate: string;
  amount: number;
  status: ConfirmationStatus | null;
  amountPaid: number | null;
}

export interface ReportLine {
  category: ExpenseCategory;
  label: string;
  /** Montako kirjausta luokassa on. */
  count: number;
  total: number;
  /** Kilometrit yhteensä, jos luokka on matkat. */
  km?: number;
  deductibleAnnually: boolean;
}

export interface TaxReport {
  year: number;
  rentalIncome: number;
  /** Kuukaudet, joista tuloa kertyi. */
  incomeMonths: number;
  lines: ReportLine[];
  /** Vuosikuluina vähennettävät yhteensä. */
  annualExpenses: number;
  /** Muut kirjaukset: eivät vuosikuluja eivätkä osa yllä olevaa summaa. */
  otherEntries: number;
  /** Vuokratulo miinus vuosikulut. Voi olla negatiivinen. */
  net: number;
}

/** Kuuluuko päivä tälle verovuodelle? */
function inYear(isoDate: string, year: number): boolean {
  return isoDate.slice(0, 4) === String(year);
}

/**
 * Yhden kuukauden vuokratulo kuittauksesta.
 *
 * Kuittaamaton kuukausi on nolla eikä oletus koko vuokrasta: laskelma ei saa
 * kertoa tulosta, jota kukaan ei ole merkinnyt saaneensa.
 */
export function incomeFrom(confirmation: ReportConfirmation): number {
  if (confirmation.status === "paid") return confirmation.amount;
  if (confirmation.status === "partial") return confirmation.amountPaid ?? 0;
  return 0;
}

/** Kokoaa vuoden laskelman. Järjestys on `EXPENSE_CATEGORIES`:n järjestys. */
export function buildTaxReport(
  year: number,
  expenses: ReportExpense[],
  confirmations: ReportConfirmation[],
): TaxReport {
  const ofYear = expenses.filter((expense) => inYear(expense.date, year));

  const lines: ReportLine[] = [];

  for (const category of EXPENSE_CATEGORIES) {
    const rows = ofYear.filter((expense) => expense.category === category.value);
    if (rows.length === 0) continue;

    const km = rows.reduce((sum, row) => sum + (row.km ?? 0), 0);

    lines.push({
      category: category.value,
      label: category.label,
      count: rows.length,
      total: round(rows.reduce((sum, row) => sum + row.amount, 0)),
      km: category.value === "matkat" && km > 0 ? round(km) : undefined,
      deductibleAnnually: category.deductibleAnnually,
    });
  }

  const paid = confirmations.filter((row) => inYear(row.dueDate, year));
  const rentalIncome = round(paid.reduce((sum, row) => sum + incomeFrom(row), 0));

  const annualExpenses = round(
    lines.filter((line) => line.deductibleAnnually).reduce((sum, line) => sum + line.total, 0),
  );
  const otherEntries = round(
    lines.filter((line) => !line.deductibleAnnually).reduce((sum, line) => sum + line.total, 0),
  );

  return {
    year,
    rentalIncome,
    incomeMonths: paid.filter((row) => incomeFrom(row) > 0).length,
    lines,
    annualExpenses,
    otherEntries,
    net: round(rentalIncome - annualExpenses),
  };
}

/** Sentin tarkkuus. Liukuluvut eivät saa tuottaa 1234.5600000000002:ta. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Onko laskelmassa mitään? Tyhjää laskelmaa ei kannata sinetöidä. */
export function isEmpty(report: TaxReport): boolean {
  return report.lines.length === 0 && report.rentalIncome === 0;
}

/** Luokan ohjeteksti laskelmaan. Sisältö on `content/tax-guidance.fi.ts`:ssä. */
export function lineHint(category: ExpenseCategory): string {
  return categoryInfo(category).hint;
}
