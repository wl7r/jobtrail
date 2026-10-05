FROM docker.io/kaylaehman/jobtrail-jobspy@sha256:6dd05d6de6461f18d0fea68491c4eb2dde27c36a3fa7d9c462f9a06f3bd2de1c
COPY main.py arbetsformedlingen.py test_search.py ./
RUN python -m unittest -v test_search
