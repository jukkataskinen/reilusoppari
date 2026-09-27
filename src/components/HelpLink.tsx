"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { helpFor } from "@/lib/help/routes";

/**
 * Sivun linkit kehyksen yläreunassa: toiminnon ohje ja kehitystoive samasta
 * toiminnosta. Toiminto valitaan sivun osoitteesta (src/lib/help/routes.ts),
 * joten sivujen ei tarvitse muistaa lisätä linkkiä itse.
 *
 * Kehitystoiveen linkki kantaa sivun osoitteen. Siinä on vain tunnisteita,
 * ei nimiä eikä osoitteita, joten se ei vie henkilötietoja eteenpäin.
 */
export function HelpLink() {
  const pathname = usePathname();
  const help = helpFor(pathname);
  if (!help) return null;
  const pill =
    "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-sm font-medium text-sky hover:border-sky/40";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {help.slug !== "kehitystoiveet" ? (
        <Link
          href={`/kehitystoiveet/uusi?toiminto=${help.slug}&sivu=${encodeURIComponent(pathname)}`}
          title={`Kehitystoive: ${help.title}`}
          className={pill}
        >
          Kehitystoive
          <span className="sr-only">: {help.title}</span>
        </Link>
      ) : null}
      <Link href={help.href} target="_blank" title={`Ohje: ${help.title}`} className={pill}>
        <span
          aria-hidden="true"
          className="grid size-4 place-items-center rounded-full bg-sky text-[11px] font-bold text-paper"
        >
          ?
        </span>
        Ohje
        <span className="sr-only">: {help.title} (avautuu uuteen välilehteen)</span>
      </Link>
    </div>
  );
}
