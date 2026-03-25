function list_child_processes () {
    local ppid=$1;
    local current_children=$(pgrep -P $ppid);
    local local_child;
    if [ $? -eq 0 ];
    then
        for current_child in $current_children
        do
          local_child=$current_child;
          list_child_processes $local_child;
          echo $local_child;
        done;
    else
      return 0;
    fi;
}

ps 70118;
while [ $? -eq 0 ];
do
  sleep 1;
  ps 70118 > /dev/null;
done;

for child in $(list_child_processes 70119);
do
  echo killing $child;
  kill -s KILL $child;
done;
rm /Users/samtanner/openc2/OpenC2/OpenC2.Server/bin/Debug/net8.0/06a6d4e74b274cef9f49c8d29a506d61.sh;
