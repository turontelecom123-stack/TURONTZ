@echo off
echo Vvedite root-parol servera (simvoly ne vidny), zatem Enter:
ssh root@178.218.207.219 "mkdir -p ~/.ssh && echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIqhbw2erE/z1Nw5om49ahsA9qv+suAXEx0msNhUFPdj turontz-deploy' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && echo KEY_ADDED_OK"
