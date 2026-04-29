#!/usr/bin/env python3
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(env_var.key + "=" + env_var.value)
except Exception as e:
    print("# Error: " + str(e), file=sys.stderr)
