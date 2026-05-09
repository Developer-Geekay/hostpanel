from setuptools import setup, find_packages

setup(
    name="hostpanel-ftp",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "pydantic",
    ],
    entry_points={
        "hostpanel.modules": [
            "ftp = hostpanel_ftp.plugin"
        ],
        "hostpanel.lifecycle": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:pre_uninstall"
        ]
    }
)
