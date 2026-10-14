#!/bin/bash

#wgt=40000
wgt=$(cat /home/belet/del-org/wgt.time)
echo "sleep for $wgt seconds"
sleep $wgt

# Get the current hour and minute in 24-hour format
current_time1=$(date +%H:%M)


print_something () {

current_time=$(date +%H)

# Check if it's later than 17:00
if [[ "$current_time" > "16" ]]; then

  echo "It's later than 17:00."
  echo $current_time
  echo "sleeping 5 hours"

  #6 hours
  sleep 25000

  # Sleep for 10 seconds
else
  echo "It's not  17:00."
  # Continue with other script tasks here
  echo  "current time is = $current_time1"

fi
}


count=0

for word in $(cat s.csv)
        do
        echo "movieid == $word"
        mcli cp --recursive mercury/movies/$word/ saturn/movies/$word/
        echo ""
        echo "----------------------------------------------------------------------------------------------------------------------------"
        echo ""

    count=$(( $count+1 ))
    if [ "$count" = "100" ]; then
        count=0
        sleep 5
        echo "sleeping........."

   print_something

    fi

echo $count
echo "$word" > last_copied
echo " "

date

done

exit 0
