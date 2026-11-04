---
procedure_id: EOCC-SSDG-LLOP
title: Low Lube Oil Pressure, Ship Service Diesel Generator
source: COMSCINST 3541.6A Engineering Casualty Control Exercises (MSC, 15 May 1986), exercise D-15 "Low Lube Oil Pressure" and E-4 "Hot Bearings of Ship's Service Generator", https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf ; NAVEDTRA Engineman 1 & C, chapter 9 "Diesel engine casualties", https://www.tpub.com/engine1/en1-190.htm
status: training copy, unclassified. Steps are adapted from the public exercise text to a DDG ship service diesel generator; the load-shift sequence (03-05) is synthetic and follows the generic EOCC pattern, not a ship-specific EOCC card.
symptoms: [low lube oil pressure alarm, LO pressure below 25 psig, lube oil pressure gauge reads low, engine noise increases, low oil pressure shutdown]
causes: [low lube oil level in sump, restricted LO strainers or filters, LO pump failure, broken LO line, faulty pressure regulator, fuel dilution of LO, high LO temperature]
effects: [overheating of engine, burned or seized bearings, loss of the generator, possible crankcase explosion]
---
1. [step: EOCC-SSDG-LLOP-01] Verify low lube oil pressure at the local gauge and compare with the remote indication. requires: none
2. [step: EOCC-SSDG-LLOP-02] Report the casualty to the EOOW and the bridge, and notify the Chief Engineer. requires: 01
3. [step: EOCC-SSDG-LLOP-03] Start the standby ship service diesel generator and parallel it to the bus. requires: 02
4. [step: EOCC-SSDG-LLOP-04] Shift electrical load to the standby generator; trip non-vital circuits if the standby unit cannot carry the full load. requires: 03
5. [step: EOCC-SSDG-LLOP-05] Secure the affected generator: open its breaker, then stop the engine. requires: 04. danger: never before 04 while the affected unit is the only source on the bus; if LO pressure falls below the trip point or bearing noise is heard, stop the engine at once and report the loss of power.
6. [step: EOCC-SSDG-LLOP-06] Check the LO level in the sump, and check the LO strainers, filters, and lines for restriction or leaks. requires: 05
7. [step: EOCC-SSDG-LLOP-07] Check LO pump capacity and the pressure regulator; test the LO for fuel dilution and check LO temperature. requires: 06
8. [step: EOCC-SSDG-LLOP-08] Correct the cause. Do not restart the engine until the cause is corrected and LO pressure is verified at the local gauge. requires: 07
9. [step: EOCC-SSDG-LLOP-09] Report the generator ready for service to the EOOW and restore the normal electrical lineup. requires: 08
