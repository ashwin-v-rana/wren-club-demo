#!/bin/zsh
# Usage: run_suite.sh <run name> [draft|live]   (results in tests/runs/<run name>; default draft)
# REAL TOOLS: sign-in sends real SMS codes to TD_TEST_PROFILE; the chains create and cancel
# real test bookings (room TD_ROOM_DAYS ahead, spa TD_SPA_DAYS ahead) and send real email + SMS.
# The service scenario logs one real pre-arrival towel request on the test profile.
# Env: CHAINS="1 2" runs the write chains twice; PROBES=0 skips the routing probes.
cd "${0:A:h}"; OUT=runs/${1:?usage: run_suite.sh <name> [draft|live]}; mkdir -p $OUT
DRAFT=true; [[ $2 == live ]] && DRAFT=false
rm -f .tok; node td_sim.mjs --token || exit 1   # fresh token: a cached one can expire mid-run
run() { node td_sim.mjs $DRAFT $OUT/$1.json "$2" > $OUT/$1.log 2>&1 }
if [[ ${PROBES:-1} != 0 ]]; then
  for i in 1 2 3; do
    run probe_book_$i      "probe:Can I book a room for next weekend?" &
    run probe_cancel_$i    "probe:I want to cancel my room booking." &
    run probe_pool_$i      "probe:Can I use the rooftop pool tonight?" &
    run probe_spa_$i       "probe:I'd like to book a massage." &
    run probe_service_$i   "probe:Could you send some extra pillows up?" &
    wait
    run probe_faq_$i       "probe:What time does the rooftop bar open?" &
    run probe_person_$i    "probe:Can I speak to a person please?" &
    run probe_generic_$i   "probe:I want to check my bookings." &
    run probe_cecconi_$i   "probe:Can I book a table at Cecconi's tonight?" &
    run probe_change_$i    "probe:I need to change the dates of my room booking." &
    wait
  done
fi
run person_1 person & run kb_gap_1 kb_gap & run large_party_1 large_party & wait
run long_stay_1 long_stay & run club_1 club & wait
run lockout_1 lockout
# Write chains, each on its own test record; every chain ends with that record cancelled.
for c in ${=CHAINS:-1}; do
  run room_book_$c room_book && run service_$c service && run room_view_$c room_view && \
    run room_change_$c room_change; run room_cancel_$c room_cancel
  run spa_book_$c spa_book && run spa_cancel_$c spa_cancel
done
python3 -I td_score.py $OUT/*.json | grep -E '^(PASS|FAIL)|passed$'
