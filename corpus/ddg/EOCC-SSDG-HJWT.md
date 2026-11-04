---
procedure_id: EOCC-SSDG-HJWT
title: High Jacket Water Temperature, Ship Service Diesel Generator
source: COMSCINST 3541.6A Engineering Casualty Control Exercises (MSC, 15 May 1986), exercise D-19 "High Fresh Water Cooling Temperature" and D-20 "Low Salt Water Cooling Pressure", https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf
status: training copy, unclassified. Steps are adapted from the public exercise text to a DDG ship service diesel generator; the standby-generator shift (07) is synthetic and follows the generic EOCC pattern, not a ship-specific EOCC card.
symptoms: [high jacket water temperature alarm, jacket water outlet temperature above 195 F, fresh water cooling thermometer reads high, low fresh water pressure, low sea water pressure, high level or gas bubbles in expansion tank]
causes: [fresh water or sea water pump failure, low level in fresh water system, air in fresh water or sea water system, plugged sea water strainer or sea chest, combustion gas leak into fresh water from a cracked head or liner, engine overload, temperature regulator failure]
effects: [reduced or loss of power output from the unit, overheating of engine, cracked cylinder head or liner]
---
1. [step: EOCC-SSDG-HJWT-01] Verify high jacket water temperature at the local thermometer, and read fresh water and sea water cooling pressures. requires: none
2. [step: EOCC-SSDG-HJWT-02] Report the casualty to the EOOW and the bridge, and notify the Chief Engineer. requires: 01
3. [step: EOCC-SSDG-HJWT-03] Reduce load on the affected generator. requires: 02
4. [step: EOCC-SSDG-HJWT-04] Check the fresh water level in the expansion tank and fresh water pump operation; vent air from the system, prime if necessary, and check for air leaks on the pump suction side. requires: 03
5. [step: EOCC-SSDG-HJWT-05] Check the temperature regulating valve; if the regulator binds or fails, operate the bypass by hand. requires: 04
6. [step: EOCC-SSDG-HJWT-06] Check the sea water side: clean the sea water strainer, check the sea water pump and vent it, and cut in emergency sea water cooling from the firemain if sea water pressure stays low. requires: 05
7. [step: EOCC-SSDG-HJWT-07] If jacket water temperature keeps rising past the high limit, start the standby generator, shift the load, and secure the affected generator. requires: 06. danger: never before 03; securing a loaded, overheated engine without first reducing load can crack the heads or liners. Let the engine idle to cool before stopping unless seizure is imminent.
8. [step: EOCC-SSDG-HJWT-08] Check the cylinders for cracks or gasket leaks between the fresh water side and the combustion side (gas bubbles in the expansion tank point to this). requires: 07
9. [step: EOCC-SSDG-HJWT-09] Correct the cause, restore cooling, restart the engine, verify normal jacket water temperature, and report the generator ready for service. requires: 08
