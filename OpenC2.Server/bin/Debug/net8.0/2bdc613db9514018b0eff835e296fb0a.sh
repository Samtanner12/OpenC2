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

ps 36044;
while [ $? -eq 0 ];
do
  sleep 1;
  ps 36044 > /dev/null;
done;

for child in $(list_child_processes 36048);
do
  echo killing $child;
  kill -s KILL $child;
done;
rm /Users/samtanner/openc2/OpenC2/OpenC2.Server/bin/Debug/net8.0/2bdc613db9514018b0eff835e296fb0a.sh;
