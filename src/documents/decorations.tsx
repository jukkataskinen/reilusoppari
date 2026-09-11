/**
 * Asiakirjojen pehmentävät elementit.
 *
 * ===========================================================================
 * MIKSI PIIRROS EIKÄ VALOKUVA
 *
 * Jukan luonnoksessa sopimuksen ylälaidassa on pyöreäksi rajattu
 * sisustusvalokuva. Sama lämpö saadaan piirroksella, ja piirros voittaa
 * kolmessa asiassa:
 *
 * 1. **Sitä ei voi sekoittaa todisteeseen.** Katselmuksen kuvat ovat tässä
 *    palvelussa todisteita. Valokuva koristeena samassa asiakirjaperheessä
 *    hämärtäisi rajan, ja juuri se raja on koko tuotteen ydin.
 * 2. Ei lisenssiä, ei latausta, ei ulkoista riippuvuutta.
 * 3. Muutaman sadan tavun vektori tuottaa saman tuloksen kuin satojen
 *    kilotavujen valokuva, ja tavut pysyvät samoina joka ajolla — asiakirjan
 *    tiiviste on osa sen todistusvoimaa.
 *
 * KATSELMUSPÖYTÄKIRJASSA EI OLE VINJETTIÄ
 *
 * Pehmeät taustamuodot kuuluvat koko asiakirjaperheeseen, mutta kuvitus ei:
 * pöytäkirjassa kuva on todiste (`DECISIONS.md` 2026-09-11). Siksi
 * `PageDecoration` on kaikkialla ja `HomeVignette` vain sopimuksessa ja
 * todistuksissa.
 * ===========================================================================
 */

import { Circle, Path, Rect, Svg, View } from "@react-pdf/renderer";
import { spacing } from "./theme";

/**
 * Taustamuodot: pehmeä muoto oikeassa ylänurkassa ja kevyempi vasemmassa
 * alanurkassa. Molemmat vuotavat sivun reunan yli, jolloin ne luetaan
 * taustaksi eikä kuvioksi.
 *
 * ===========================================================================
 * KAKSI PIENTÄ NURKKAELEMENTTIÄ, EI YHTÄ SIVUNKOKOISTA
 *
 * Ensimmäinen versio oli yksi sivunkokoinen kerros negatiivisella
 * siirtymällä. Se leikkautui: absoluuttinen sijainti lasketaan sivun
 * SISENNETYSTÄ sisältöalueesta, joka on sisennyksen verran pienempi kuin
 * sivu, eikä sivunkokoinen lapsi mahdu siihen.
 *
 * Nurkkaelementit ovat omien muotojensa kokoisia ja mahtuvat aina.
 * Negatiivinen siirtymä työntää ne reunan yli, ja sivun reuna rajaa ne —
 * juuri niin kuin vuotavan taustan kuuluukin toimia.
 * ===========================================================================
 *
 * Renderöidään sivun ensimmäisenä lapsena, jotta sisältö piirtyy päälle.
 * Ei `fixed`: toistuva taustakuvio joka sivulla olisi rauhaton.
 */
export function PageDecoration() {
  return (
    <>
      <View style={{ position: "absolute", top: -spacing.page, right: -spacing.page }}>
        <Svg width={215} height={215} viewBox="0 0 215 215">
          <Path
            d="M215 -10 L215 185 C168 205 104 190 79 148 C53 104 87 44 149 28 C171 22 196 12 215 -10 Z"
            fill="#eaf1fb"
          />
        </Svg>
      </View>

      <View style={{ position: "absolute", bottom: -spacing.page - 18, left: -spacing.page }}>
        <Svg width={125} height={95} viewBox="0 0 125 95">
          <Path d="M0 95 L0 18 C40 4 86 16 106 46 C120 67 120 84 115 95 Z" fill="#f1f6fd" />
        </Svg>
      </View>
    </>
  );
}

/**
 * Pyöreä vinjetti: ikkuna, sohva ja huonekasvi.
 *
 * Sommittelu mahtuu kokonaan ympyrän sisään — ensimmäisessä versiossa kasvi
 * leikkautui reunaan ja sohva törmäsi ympyrän laitaan. Muodot ovat
 * `Circle`, `Rect` ja `Path` (vain M/L/C/Z), koska ne ovat ne, joita
 * React-PDF:n SVG-toteutus varmasti tukee.
 */
export function HomeVignette({ size = 118 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Circle cx={100} cy={100} r={100} fill="#dfeaf9" />

      {/* lattia */}
      <Path d="M24 152 L176 152" stroke="#bcd5f3" strokeWidth={2.5} strokeLinecap="round" />

      {/* ikkuna */}
      <Rect x={50} y={42} width={70} height={56} rx={5} fill="#ffffff" stroke="#8fb9ff" strokeWidth={2.5} />
      <Path d="M85 42 L85 98" stroke="#8fb9ff" strokeWidth={2.5} />
      <Path d="M50 70 L120 70" stroke="#8fb9ff" strokeWidth={2.5} />

      {/* sohva */}
      <Rect x={42} y={116} width={86} height={36} rx={9} fill="#cfe0f7" />
      <Rect x={38} y={134} width={94} height={18} rx={8} fill="#3d8bff" />
      <Rect x={52} y={122} width={26} height={15} rx={5} fill="#f4f8fe" />
      <Rect x={84} y={122} width={26} height={15} rx={5} fill="#f4f8fe" />

      {/* huonekasvi */}
      <Path d="M150 152 L166 152 L163 124 L153 124 Z" fill="#8fb9ff" />
      <Path d="M158 124 C158 108 150 98 140 96 C144 110 149 118 158 124 Z" fill="#3d8bff" />
      <Path d="M158 124 C158 110 167 100 178 99 C173 112 167 119 158 124 Z" fill="#a9caff" />
    </Svg>
  );
}

/**
 * Lehtioksa. Pieni lämmin yksityiskohta loppusanan viereen.
 *
 * Ei taustalle vaan osaksi sisältöä: taustalla se osuisi tekstin päälle
 * sivunvaihdon jälkeen, eikä sitä voi ennakoida.
 */
export function LeafSprig({ size = 42 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 160 200">
      <Path
        d="M74 194 C74 138 82 100 116 58"
        stroke="#a9caff"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <Path d="M88 140 C66 136 52 120 50 100 C72 102 86 118 88 140 Z" fill="#d8e6f9" />
      <Path d="M94 122 C114 112 124 92 122 72 C102 80 92 102 94 122 Z" fill="#bcd5f3" />
      <Path d="M80 168 C60 162 50 146 50 128 C70 134 80 150 80 168 Z" fill="#e4edfa" />
      <Path d="M106 86 C126 78 138 60 138 42 C118 48 106 66 106 86 Z" fill="#d8e6f9" />
    </Svg>
  );
}
