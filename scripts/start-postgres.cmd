@echo off
set "PATH=E:\123123\bk\pgsql\pgsql\bin;C:\Windows\System32;C:\Windows"
cd /d E:\123123\bk
"E:\123123\bk\pgsql\pgsql\bin\postgres.exe" -D "E:\123123\bk\pgdata" -p 5432 >> "E:\123123\bk\postgres-runtime.log" 2>&1
