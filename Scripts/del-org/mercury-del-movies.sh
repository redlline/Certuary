#!/bin/bash

# Get the current hour and minute in 24-hour format
current_time1=$(date +%H:%M)
echo "" > del_mercury.csv

for word in $(cat list.mercury)
        do
        echo ""
        echo "----------------------------------------------------------------------------------------------------------------------------"
        echo "mcli rm --recursive --force  mercury/movies/$word/" >> del_mercury.csv
        echo ""

date

done


exit 0
