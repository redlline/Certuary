#!/bin/bash

# Get the current hour and minute in 24-hour format
current_time1=$(date +%H:%M)

echo " " > del_mp4.csv

for word in $(cat 7d)
        do
        echo ""
        echo "----------------------------------------------------------------------------------------------------------------------------"
        echo "mcli rm $word" >> del_mp4.csv
        echo ""

date

done


exit 0
