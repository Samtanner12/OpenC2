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

ps 22763;
while [ $? -eq 0 ];
do
  sleep 1;
  ps 22763 > /dev/null;
done;

for child in $(list_child_processes 22764);
do
  echo killing $child;
  kill -s KILL $child;
done;
rm /Users/samtanner/openc2/OpenC2/OpenC2.Server/bin/Debug/net8.0/c9a4a6cdb4564848a5ce724f708b9fd8.sh;
