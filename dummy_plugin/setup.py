from setuptools import setup, find_packages

setup(
    name="hostpanel-dummy",
    version="1.0.0",
    packages=find_packages(),
    entry_points={
        "hostpanel.modules": [
            "dummy = dummy_plugin.plugin"
        ]
    }
)
