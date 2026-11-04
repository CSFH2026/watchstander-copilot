---
procedure_id: EOCC-SSDG-LFOP
title: Loss of Fuel Oil Pressure, Ship Service Diesel Generator
source: COMSCINST 3541.6A Engineering Casualty Control Exercises (MSC, 15 May 1986), exercise D-14 "Loss of Fuel Oil Pressure", https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf ; NAVEDTRA Engineman 1 & C, chapter 9 "Fuel oil casualties", https://www.tpub.com/engine1/en1-191.htm
status: training copy, unclassified. Steps are adapted from the public exercise text to a DDG ship service diesel generator; the standby-generator shift (07) is synthetic and follows the generic EOCC pattern, not a ship-specific EOCC card.
symptoms: [low fuel oil pressure alarm, fuel oil pressure gauge reads low or zero, engine slows down or stops, irregular engine operation, engine unable to carry load, fuel oil pump failure alarm]
causes: [low fuel oil level in service tank, restriction in piping, fuel oil pump failure, water in fuel oil, dirty fuel oil filters or strainers, air entrainment in fuel oil system, accidental operation of remote fuel shutoff, faulty relief valve or pressure regulating valve]
effects: [reduced or loss of generator power, engine stops, loss of electrical power if the unit is the only source on the bus]
---
1. [step: EOCC-SSDG-LFOP-01] Verify low fuel oil pressure at the local gauge; note whether the engine is slowing, hunting, or unable to carry load. requires: none
2. [step: EOCC-SSDG-LFOP-02] Report the casualty to the EOOW and the bridge, and notify the Chief Engineer. requires: 01
3. [step: EOCC-SSDG-LFOP-03] Check the fuel oil service (day) tank level and confirm the remote fuel shutoff has not been operated; shift suction to the alternate service tank if the tank is low or contaminated. requires: 02
4. [step: EOCC-SSDG-LFOP-04] Check the fuel oil pump; start the standby fuel oil booster pump and bleed air from the booster pump and lines. requires: 03
5. [step: EOCC-SSDG-LFOP-05] Check the fuel oil filters and strainers for restriction and shift to the clean element. requires: 04
6. [step: EOCC-SSDG-LFOP-06] Check for water in the fuel oil; drain water from all filters, strainers, and lines. requires: 05
7. [step: EOCC-SSDG-LFOP-07] If fuel oil pressure cannot be restored and the engine cannot carry its load, start the standby generator, shift the load, and secure the affected generator. requires: 06. danger: never before the standby generator is paralleled and carrying the load; opening the breaker on a sole source blacks out the bus.
8. [step: EOCC-SSDG-LFOP-08] Check the fuel oil pressure regulating valve and relief valve for a broken spring; replace the spring and reset the regulating pressure. requires: 07
9. [step: EOCC-SSDG-LFOP-09] With fuel oil pressure restored, open the engine test cocks and turn the engine over to confirm the system is free of water, then close the cocks, restart, check operation, and report the generator ready for service. requires: 08
